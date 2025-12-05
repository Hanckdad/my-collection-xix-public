// Configuration
const CONFIG = {
    API_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:3000/api' 
        : '/api',
    ITEMS_PER_LOAD: 12,
    AUTO_REFRESH_INTERVAL: 30000, // 30 seconds
    ADMIN_USERNAMES: ['admin', 'owner', 'authorized'], // Allowed admin usernames
    VERSION: '1.0.0'
};

// Global State
let allPosts = [];
let filteredPosts = [];
let currentFilter = 'all';
let currentPage = 1;
let isLoading = false;
let totalPosts = 0;
let currentLightboxIndex = -1;
let onlineUsers = 1;

// DOM Elements
const elements = {
    contentGrid: document.getElementById('contentGrid'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    totalPosts: document.getElementById('totalPosts'),
    totalViews: document.getElementById('totalViews'),
    onlineUsers: document.getElementById('onlineUsers'),
    lastUpdate: document.getElementById('lastUpdate'),
    showingCount: document.getElementById('showingCount'),
    totalCount: document.getElementById('totalCount'),
    lightbox: document.getElementById('lightbox'),
    toast: document.getElementById('toast'),
    loadingOverlay: document.getElementById('loadingOverlay')
};

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    startAutoRefresh();
    updateOnlineUsers();
});

// Initialize Application
function initializeApp() {
    showLoading(true);
    loadPosts();
    updateStats();
    
    // Check URL for direct post
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('post');
    if (postId) {
        setTimeout(() => openPostById(postId), 1000);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            setFilter(filter);
        });
    });
    
    // Lightbox close on click outside
    elements.lightbox.addEventListener('click', function(e) {
        if (e.target === this) {
            closeLightbox();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft' && isLightboxOpen()) previousPost();
        if (e.key === 'ArrowRight' && isLightboxOpen()) nextPost();
    });
    
    // Refresh button
    window.refreshContent = function() {
        showToast('Refreshing content...', 'info');
        currentPage = 1;
        loadPosts();
    };
    
    // Scroll to top
    window.scrollToTop = function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    // Theme toggle
    window.toggleTheme = function() {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
        showToast('Theme updated', 'success');
    };
    
    // Check saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme !== 'dark') {
        document.body.classList.remove('dark-theme');
    }
}

// Load Posts from API
async function loadPosts() {
    if (isLoading) return;
    
    isLoading = true;
    showLoading(true);
    
    try {
        const response = await fetch(`${CONFIG.API_URL}/posts?page=${currentPage}&limit=${CONFIG.ITEMS_PER_LOAD}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            if (currentPage === 1) {
                allPosts = data.posts;
            } else {
                allPosts = [...allPosts, ...data.posts];
            }
            
            totalPosts = data.total;
            applyFilter();
            updateDisplay();
            
            // Update last update time
            elements.lastUpdate.textContent = formatTimeAgo(new Date());
            
            // Show notification for new posts
            if (currentPage === 1 && data.posts.length > 0) {
                showToast(`Loaded ${data.posts.length} posts`, 'success');
            }
            
            // Hide load more if no more posts
            if (allPosts.length >= totalPosts) {
                elements.loadMoreBtn.style.display = 'none';
            } else {
                elements.loadMoreBtn.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        showToast('Failed to load content. Please refresh.', 'error');
        
        // Fallback to sample data
        loadSampleData();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

// Load More Posts
window.loadMorePosts = function() {
    if (isLoading) return;
    
    currentPage++;
    loadPosts();
    showToast('Loading more posts...', 'info');
};

// Apply Filter
function setFilter(filter) {
    currentFilter = filter;
    
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    applyFilter();
    renderPosts();
    
    // Scroll to top of grid
    elements.contentGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyFilter() {
    switch (currentFilter) {
        case 'image':
            filteredPosts = allPosts.filter(post => post.type === 'image');
            break;
        case 'video':
            filteredPosts = allPosts.filter(post => post.type === 'video');
            break;
        case 'latest':
            filteredPosts = [...allPosts]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 12);
            break;
        default:
            filteredPosts = allPosts;
    }
}

// Render Posts to Grid
function renderPosts() {
    if (filteredPosts.length === 0) {
        elements.contentGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                <i class="fas fa-box-open" style="font-size: 4rem; color: var(--text-muted); margin-bottom: 20px;"></i>
                <h3 style="color: var(--text-primary); margin-bottom: 15px; font-size: 1.5rem;">No Content Yet</h3>
                <p style="color: var(--text-muted); margin-bottom: 20px; max-width: 500px; margin: 0 auto;">
                    Content will appear here when admin uploads via Telegram bot.
                </p>
                <div style="background: rgba(0, 255, 234, 0.1); padding: 20px; border-radius: 10px; border: 1px solid var(--border-color); max-width: 500px; margin: 20px auto;">
                    <p style="color: var(--accent-green); margin-bottom: 10px;">
                        <i class="fas fa-robot"></i> Telegram Bot: @MyCollectionXIXBot
                    </p>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">
                        Admin upload command: <code>/upload Your caption here</code>
                    </p>
                </div>
            </div>
        `;
        return;
    }
    
    const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_LOAD;
    const endIndex = Math.min(startIndex + CONFIG.ITEMS_PER_LOAD, filteredPosts.length);
    const postsToShow = filteredPosts.slice(startIndex, endIndex);
    
    elements.contentGrid.innerHTML = postsToShow.map((post, index) => createPostCard(post, index)).join('');
    
    // Add click handlers
    document.querySelectorAll('.post-card').forEach((card, index) => {
        card.addEventListener('click', () => openLightbox(postsToShow[index]));
    });
}

// Create Post Card HTML
function createPostCard(post, index) {
    const timeAgo = formatTimeAgo(new Date(post.created_at));
    const views = post.views || 0;
    
    return `
        <div class="post-card" data-id="${post.id}" data-index="${index}">
            <div class="post-media">
                ${post.type === 'video' 
                    ? `<video muted playsinline poster="${post.thumbnail || ''}">
                         <source src="${post.media_url}" type="video/mp4">
                         Your browser does not support video.
                       </video>`
                    : `<img src="${post.media_url}" alt="${post.caption}" loading="lazy">`
                }
                <span class="media-type-badge">
                    <i class="fas fa-${post.type === 'video' ? 'video' : 'image'}"></i>
                    ${post.type === 'video' ? 'Video' : 'Photo'}
                </span>
            </div>
            <div class="post-content">
                <h3 class="post-title">${escapeHtml(post.caption || 'Untitled')}</h3>
                <p class="post-description">${escapeHtml(post.description || '')}</p>
                <div class="post-meta">
                    <div class="meta-item">
                        <i class="fas fa-user"></i>
                        <span>${escapeHtml(post.author || 'Admin')}</span>
                    </div>
                    <div class="meta-item">
                        <i class="fas fa-eye"></i>
                        <span>${views} views</span>
                    </div>
                    <div class="meta-item">
                        <i class="fas fa-clock"></i>
                        <span>${timeAgo}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Update Display
function updateDisplay() {
    renderPosts();
    updateStats();
    
    // Update counters
    const showing = Math.min(currentPage * CONFIG.ITEMS_PER_LOAD, filteredPosts.length);
    elements.showingCount.textContent = showing;
    elements.totalCount.textContent = filteredPosts.length;
}

// Update Statistics
function updateStats() {
    const totalViews = allPosts.reduce((sum, post) => sum + (post.views || 0), 0);
    
    elements.totalPosts.textContent = allPosts.length;
    elements.totalViews.textContent = totalViews.toLocaleString();
}

// Update Online Users (simulated)
function updateOnlineUsers() {
    // Simulate random online users between 1-50
    const randomUsers = Math.floor(Math.random() * 50) + 1;
    onlineUsers = randomUsers;
    elements.onlineUsers.textContent = onlineUsers;
    
    // Update every minute
    setTimeout(updateOnlineUsers, 60000);
}

// Lightbox Functions
function openLightbox(post) {
    if (!post) return;
    
    currentLightboxIndex = filteredPosts.findIndex(p => p.id === post.id);
    if (currentLightboxIndex === -1) return;
    
    const postData = filteredPosts[currentLightboxIndex];
    
    // Update lightbox content
    document.getElementById('lightboxTitle').textContent = postData.caption || 'Untitled';
    document.getElementById('lightboxDescription').textContent = postData.description || '';
    document.getElementById('lightboxAuthor').textContent = postData.author || 'Admin';
    document.getElementById('lightboxDate').textContent = formatDate(new Date(postData.created_at));
    document.getElementById('lightboxViews').textContent = `${postData.views || 0} views`;
    document.getElementById('lightboxType').textContent = postData.type === 'video' ? 'Video' : 'Image';
    
    // Update media
    const mediaContainer = document.getElementById('lightboxMedia');
    if (postData.type === 'video') {
        mediaContainer.innerHTML = `
            <video controls autoplay playsinline>
                <source src="${postData.media_url}" type="video/mp4">
                Your browser does not support video.
            </video>
        `;
    } else {
        mediaContainer.innerHTML = `<img src="${postData.media_url}" alt="${postData.caption}">`;
    }
    
    // Show lightbox
    elements.lightbox.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Increment view count
    incrementViewCount(postData.id);
}

function closeLightbox() {
    elements.lightbox.style.display = 'none';
    document.body.style.overflow = 'auto';
    
    // Stop video if playing
    const video = elements.lightbox.querySelector('video');
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
    
    // Update URL
    history.replaceState(null, '', window.location.pathname);
}

function isLightboxOpen() {
    return elements.lightbox.style.display === 'block';
}

function previousPost() {
    if (currentLightboxIndex > 0) {
        currentLightboxIndex--;
        openLightbox(filteredPosts[currentLightboxIndex]);
    }
}

function nextPost() {
    if (currentLightboxIndex < filteredPosts.length - 1) {
        currentLightboxIndex++;
        openLightbox(filteredPosts[currentLightboxIndex]);
    }
}

function openPostById(postId) {
    const post = allPosts.find(p => p.id == postId);
    if (post) {
        openLightbox(post);
    }
}

// API Functions
async function incrementViewCount(postId) {
    try {
        await fetch(`${CONFIG.API_URL}/posts/${postId}/view`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Update local count
        const post = allPosts.find(p => p.id == postId);
        if (post) {
            post.views = (post.views || 0) + 1;
            updateStats();
            
            // Update in filtered posts too
            const filteredPost = filteredPosts.find(p => p.id == postId);
            if (filteredPost) {
                filteredPost.views = post.views;
            }
        }
    } catch (error) {
        console.error('Error incrementing view count:', error);
    }
}

// Utility Functions
function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    
    const minute = 60 * 1000;
    const hour = minute * 60;
    const day = hour * 24;
    const week = day * 7;
    const month = day * 30;
    const year = day * 365;
    
    if (diff < minute) return 'Just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    if (diff < week) return `${Math.floor(diff / day)}d ago`;
    if (diff < month) return `${Math.floor(diff / week)}w ago`;
    if (diff < year) return `${Math.floor(diff / month)}mo ago`;
    return `${Math.floor(diff / year)}y ago`;
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show/Hide Loading
function showLoading(show) {
    if (show) {
        elements.loadingOverlay.style.display = 'flex';
    } else {
        elements.loadingOverlay.style.display = 'none';
    }
}

// Toast Notification
function showToast(message, type = 'info') {
    const icon = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle',
        warning: 'fas fa-exclamation-triangle'
    }[type] || 'fas fa-info-circle';
    
    elements.toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    elements.toast.className = `toast ${type}`;
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// Auto Refresh
function startAutoRefresh() {
    setInterval(async () => {
        try {
            const response = await fetch(`${CONFIG.API_URL}/posts/latest`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.posts.length > 0) {
                    const latestId = data.posts[0].id;
                    const currentLatestId = allPosts[0]?.id;
                    
                    if (latestId !== currentLatestId) {
                        // New content available
                        if (currentPage === 1) {
                            // Refresh if on first page
                            currentPage = 1;
                            loadPosts();
                        } else {
                            // Show notification
                            showToast('New content available! Refresh to see.', 'info');
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Auto refresh error:', error);
        }
    }, CONFIG.AUTO_REFRESH_INTERVAL);
}

// Share Functions
window.shareCurrentPost = function() {
    if (currentLightboxIndex === -1) return;
    
    const post = filteredPosts[currentLightboxIndex];
    const url = `${window.location.origin}?post=${post.id}`;
    
    if (navigator.share) {
        navigator.share({
            title: post.caption || 'MY COLLECTION XIX',
            text: post.description || '',
            url: url
        });
    } else {
        copyToClipboard(url);
        showToast('Link copied to clipboard!', 'success');
    }
};

window.downloadCurrentMedia = function() {
    if (currentLightboxIndex === -1) return;
    
    const post = filteredPosts[currentLightboxIndex];
    const link = document.createElement('a');
    link.href = post.media_url;
    link.download = `collection_${post.id}_${Date.now()}.${post.type === 'video' ? 'mp4' : 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Download started...', 'success');
};

window.copyPostLink = function() {
    if (currentLightboxIndex === -1) return;
    
    const post = filteredPosts[currentLightboxIndex];
    const url = `${window.location.origin}?post=${post.id}`;
    copyToClipboard(url);
    showToast('Post link copied!', 'success');
};

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Sample Data for Fallback
function loadSampleData() {
    allPosts = [
        {
            id: 1,
            type: 'image',
            media_url: 'https://images.unsplash.com/photo-1579546929662-711aa81148cf?w=800&h=600&fit=crop',
            thumbnail: 'https://images.unsplash.com/photo-1579546929662-711aa81148cf?w=400&h=300&fit=crop',
            caption: 'Welcome to MY COLLECTION XIX',
            description: 'This is a public gallery where admin uploads content via Telegram bot.',
            author: 'Admin',
            created_at: new Date().toISOString(),
            views: 42
        },
        {
            id: 2,
            type: 'video',
            media_url: 'https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4',
            thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop',
            caption: 'Sample Video Content',
            description: 'Example of video content that can be uploaded via Telegram bot.',
            author: 'Admin',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            views: 128
        }
    ];
    
    filteredPosts = allPosts;
    updateDisplay();
    showToast('Using sample data. Check console for errors.', 'warning');
}

// Performance Monitoring
if ('performance' in window) {
    window.addEventListener('load', () => {
        const timing = performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        console.log(`Page loaded in ${loadTime}ms`);
    });
}

// Error Handling
window.addEventListener('error', function(e) {
    console.error('Unhandled error:', e.error);
    showToast('An error occurred. Please refresh.', 'error');
});

// Service Worker for PWA
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('Service Worker registration failed:', err);
        });
    });
}