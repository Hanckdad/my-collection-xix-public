const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Bot Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8119451118:AAHNcK9zOYlzMkTkyF5TR3MXFOg1H6tMq74';
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || 'admin,owner')
    .split(',')
    .map(u => u.trim().toLowerCase());

const bot = new Telegraf(BOT_TOKEN);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Data storage
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// Ensure data directory exists
if (!fsSync.existsSync(DATA_DIR)) {
    fsSync.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files
async function initializeData() {
    if (!fsSync.existsSync(POSTS_FILE)) {
        await fs.writeFile(POSTS_FILE, JSON.stringify([]));
    }
    
    if (!fsSync.existsSync(STATS_FILE)) {
        await fs.writeFile(STATS_FILE, JSON.stringify({
            total_posts: 0,
            total_views: 0,
            last_update: new Date().toISOString()
        }));
    }
}

// Helper functions
async function readPosts() {
    try {
        const data = await fs.readFile(POSTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading posts:', error);
        return [];
    }
}

async function writePosts(posts) {
    try {
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing posts:', error);
        return false;
    }
}

async function updateStats() {
    try {
        const posts = await readPosts();
        const stats = {
            total_posts: posts.length,
            total_views: posts.reduce((sum, post) => sum + (post.views || 0), 0),
            last_update: new Date().toISOString()
        };
        
        await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
        return stats;
    } catch (error) {
        console.error('Error updating stats:', error);
        return null;
    }
}

// API Routes

// Get all posts with pagination
app.get('/api/posts', async (req, res) => {
    try {
        const { page = 1, limit = 12 } = req.query;
        const posts = await readPosts();
        
        // Sort by date (newest first)
        const sortedPosts = posts.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        
        const paginatedPosts = sortedPosts.slice(startIndex, endIndex);
        const stats = await updateStats();
        
        res.json({
            success: true,
            posts: paginatedPosts,
            total: posts.length,
            page: pageNum,
            total_pages: Math.ceil(posts.length / limitNum),
            stats: stats
        });
    } catch (error) {
        console.error('Error in /api/posts:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get latest posts
app.get('/api/posts/latest', async (req, res) => {
    try {
        const posts = await readPosts();
        const latest = posts
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);
        
        res.json({
            success: true,
            posts: latest
        });
    } catch (error) {
        console.error('Error in /api/posts/latest:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Increment view count
app.post('/api/posts/:id/view', async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const posts = await readPosts();
        
        const postIndex = posts.findIndex(p => p.id === postId);
        if (postIndex !== -1) {
            posts[postIndex].views = (posts[postIndex].views || 0) + 1;
            await writePosts(posts);
            await updateStats();
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error in view count:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await updateStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error in /api/stats:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Telegram Bot Webhook
app.post('/webhook', async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Telegram Bot Setup

// Check if user is admin
function isAdmin(ctx) {
    const username = ctx.from.username;
    if (!username) return false;
    
    return ADMIN_USERNAMES.includes(username.toLowerCase());
}

bot.start((ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Access Denied\n\nThis bot is for admin use only.');
    }
    
    ctx.reply(`🔐 Welcome Admin!\n\n📤 Upload photos/videos to the public website:\n\n1. Send a photo or video\n2. Add caption starting with /upload\n\nExample:\n<code>/upload This is an amazing photo</code>\n\n🌐 Website: ${process.env.WEBSITE_URL || 'https://your-site.com'}`, 
    { parse_mode: 'HTML' });
});

bot.help((ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ This bot is for admin use only.');
    }
    
    ctx.reply(`🤖 Admin Commands:\n\n` +
             `/start - Start the bot\n` +
             `/upload [caption] - Upload photo/video with caption\n` +
             `/stats - Get website statistics\n` +
             `/list - List all posts\n` +
             `/delete [id] - Delete a post\n\n` +
             `💡 How to upload:\n` +
             `1. Take a photo or video\n` +
             `2. Add caption: <code>/upload Your caption here</code>\n` +
             `3. Add description (optional)\n` +
             `4. Send it!`, 
    { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Admin only command.');
    }
    
    try {
        const stats = await updateStats();
        const posts = await readPosts();
        
        const totalImages = posts.filter(p => p.type === 'image').length;
        const totalVideos = posts.filter(p => p.type === 'video').length;
        
        ctx.reply(`📊 Website Statistics:\n\n` +
                 `📝 Total Posts: ${stats.total_posts}\n` +
                 `👁️ Total Views: ${stats.total_views}\n` +
                 `🖼️ Images: ${totalImages}\n` +
                 `🎥 Videos: ${totalVideos}\n` +
                 `🕒 Last Update: ${new Date(stats.last_update).toLocaleString()}\n\n` +
                 `👤 Admin: ${ctx.from.username}`);
    } catch (error) {
        console.error('Error getting stats:', error);
        ctx.reply('❌ Error getting statistics');
    }
});

bot.command('list', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Admin only command.');
    }
    
    try {
        const posts = await readPosts();
        const latest = posts.slice(0, 10);
        
        if (latest.length === 0) {
            return ctx.reply('📭 No posts yet. Start uploading!');
        }
        
        let message = '📋 Latest 10 Posts:\n\n';
        latest.forEach((post, index) => {
            const date = new Date(post.created_at);
            const timeAgo = formatTimeAgo(date);
            message += `${index + 1}. ${post.caption || 'Untitled'}\n`;
            message += `   👁️ ${post.views || 0} views | ${timeAgo}\n`;
            message += `   🆔 ID: ${post.id}\n\n`;
        });
        
        message += `📊 Total: ${posts.length} posts`;
        ctx.reply(message);
    } catch (error) {
        console.error('Error listing posts:', error);
        ctx.reply('❌ Error listing posts');
    }
});

bot.command('delete', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Admin only command.');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
        return ctx.reply('Usage: /delete [post_id]\nExample: /delete 123');
    }
    
    const postId = parseInt(args[0]);
    if (isNaN(postId)) {
        return ctx.reply('❌ Invalid post ID');
    }
    
    try {
        const posts = await readPosts();
        const postIndex = posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return ctx.reply('❌ Post not found');
        }
        
        const deletedPost = posts.splice(postIndex, 1)[0];
        await writePosts(posts);
        await updateStats();
        
        ctx.reply(`✅ Post deleted successfully!\n\n` +
                 `📝 Caption: ${deletedPost.caption || 'Untitled'}\n` +
                 `🆔 ID: ${deletedPost.id}\n` +
                 `📊 Remaining posts: ${posts.length}`);
        
        console.log(`Post ${postId} deleted by ${ctx.from.username}`);
    } catch (error) {
        console.error('Error deleting post:', error);
        ctx.reply('❌ Error deleting post');
    }
});

// Handle photo upload
bot.on('photo', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Admin only. You are not authorized to upload.');
    }
    
    try {
        const caption = ctx.message.caption || '';
        const command = caption.split(' ')[0];
        
        if (command !== '/upload') {
            return ctx.reply('📤 Please use /upload command with your caption\nExample: /upload This is an amazing photo');
        }
        
        const [_, ...captionParts] = caption.split(' ');
        const actualCaption = captionParts.join(' ').trim() || 'Untitled Post';
        
        // Get the highest quality photo
        const photo = ctx.message.photo.pop();
        
        // Get file URL from Telegram
        const file = await ctx.telegram.getFileLink(photo.file_id);
        const fileUrl = file.href;
        
        // Create new post
        const posts = await readPosts();
        const newPost = {
            id: Date.now(),
            type: 'image',
            media_url: fileUrl,
            thumbnail: fileUrl, // Same URL for images
            caption: actualCaption,
            description: '', // Will be set from description message if provided
            author: ctx.from.username || ctx.from.first_name || 'Admin',
            created_at: new Date().toISOString(),
            views: 0,
            telegram_file_id: photo.file_id,
            width: photo.width,
            height: photo.height,
            file_size: photo.file_size
        };
        
        // Ask for description
        ctx.reply('✅ Photo received! Please send a description for this post (or send "skip" to skip):');
        
        // Store temporary data for description
        ctx.session = ctx.session || {};
        ctx.session.pendingPost = newPost;
        ctx.session.waitingForDescription = true;
        
    } catch (error) {
        console.error('Error handling photo:', error);
        ctx.reply('❌ Error processing photo. Please try again.');
    }
});

// Handle video upload
bot.on('video', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Admin only. You are not authorized to upload.');
    }
    
    try {
        const caption = ctx.message.caption || '';
        const command = caption.split(' ')[0];
        
        if (command !== '/upload') {
            return ctx.reply('📤 Please use /upload command with your caption\nExample: /upload This is an awesome video');
        }
        
        const [_, ...captionParts] = caption.split(' ');
        const actualCaption = captionParts.join(' ').trim() || 'Untitled Video';
        
        const video = ctx.message.video;
        
        // Get file URL from Telegram
        const file = await ctx.telegram.getFileLink(video.file_id);
        const fileUrl = file.href;
        
        // Create new post
        const posts = await readPosts();
        const newPost = {
            id: Date.now(),
            type: 'video',
            media_url: fileUrl,
            thumbnail: '', // Telegram doesn't provide video thumbnails
            caption: actualCaption,
            description: '',
            author: ctx.from.username || ctx.from.first_name || 'Admin',
            created_at: new Date().toISOString(),
            views: 0,
            telegram_file_id: video.file_id,
            duration: video.duration,
            width: video.width,
            height: video.height,
            file_size: video.file_size
        };
        
        // Ask for description
        ctx.reply('✅ Video received! Please send a description for this post (or send "skip" to skip):');
        
        // Store temporary data
        ctx.session = ctx.session || {};
        ctx.session.pendingPost = newPost;
        ctx.session.waitingForDescription = true;
        
    } catch (error) {
        console.error('Error handling video:', error);
        ctx.reply('❌ Error processing video. Please try again.');
    }
});

// Handle text messages (for descriptions)
bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.waitingForDescription) {
        // Check if it's a regular command
        const text = ctx.message.text;
        if (text.startsWith('/')) {
            return; // Let other command handlers deal with it
        }
        return;
    }
    
    try {
        const description = ctx.message.text.trim();
        
        if (description.toLowerCase() === 'skip') {
            ctx.session.pendingPost.description = '';
        } else {
            ctx.session.pendingPost.description = description;
        }
        
        // Save the post
        const posts = await readPosts();
        posts.unshift(ctx.session.pendingPost); // Add to beginning
        await writePosts(posts);
        await updateStats();
        
        // Clear session
        ctx.session.pendingPost = null;
        ctx.session.waitingForDescription = false;
        
        const post = ctx.session.pendingPost;
        const postType = post.type === 'video' ? 'video' : 'photo';
        
        ctx.reply(`✅ ${postType.charAt(0).toUpperCase() + postType.slice(1)} uploaded successfully!\n\n` +
                 `📝 Caption: ${post.caption}\n` +
                 `📋 Description: ${post.description || 'None'}\n` +
                 `👤 By: ${post.author}\n` +
                 `🆔 ID: ${post.id}\n\n` +
                 `🌐 View on website: ${process.env.WEBSITE_URL || ''}\n` +
                 `Direct link: ${process.env.WEBSITE_URL || ''}/?post=${post.id}`);
        
        console.log(`New ${postType} uploaded by ${post.author}: ${post.caption}`);
        
    } catch (error) {
        console.error('Error saving post:', error);
        ctx.reply('❌ Error saving post. Please try again.');
        
        // Clear session on error
        ctx.session.pendingPost = null;
        ctx.session.waitingForDescription = false;
    }
});

// Utility function for time ago
function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    
    const minute = 60 * 1000;
    const hour = minute * 60;
    const day = hour * 24;
    
    if (diff < minute) return 'Just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    return `${Math.floor(diff / day)}d ago`;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'MY COLLECTION XIX API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
async function startServer() {
    await initializeData();
    
    if (process.env.NODE_ENV === 'production') {
        // Production: Use webhook
        const WEBHOOK_URL = process.env.WEBHOOK_URL || 
                           `https://${process.env.RAILWAY_STATIC_URL || 'your-domain.com'}/webhook`;
        
        bot.telegram.setWebhook(WEBHOOK_URL)
            .then(() => console.log(`🌐 Webhook set to: ${WEBHOOK_URL}`))
            .catch(err => console.error('Webhook error:', err));
    } else {
        // Development: Use polling
        bot.launch();
        console.log('🤖 Telegram bot started in development mode');
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 Website: http://localhost:${PORT}`);
        console.log(`🤖 Bot Token: ${BOT_TOKEN.substring(0, 10)}...`);
        console.log(`👑 Admin usernames: ${ADMIN_USERNAMES.join(', ')}`);
    });
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

startServer().catch(console.error);