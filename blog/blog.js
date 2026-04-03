// Agent Laplace Blog System
// Lightweight client-side blog engine for GitHub Pages

class BlogEngine {
    constructor() {
        this.posts = [];
        this.categories = {};
        this.tags = [];
        this.currentFilter = null;
        this.searchTerm = '';
        this.searchTimeout = null;
    }

    async init() {
        try {
            console.log('Loading blog data...');
            const response = await fetch('/blog/posts.json?v=' + Date.now());
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Data loaded:', data);
            
            this.posts = data.posts || [];
            this.categories = data.categories || {};
            this.tags = data.tags || [];
            
            console.log('Posts count:', this.posts.length);
            this.renderBlog();
        } catch (error) {
            console.error('Failed to load blog data:', error);
            document.getElementById('blog-content').innerHTML = 
                `<div style="text-align:center;padding:3rem;color:#6b7280;">
                    <h3>Failed to load blog posts</h3>
                    <p>Error: ${error.message}</p>
                    <p>Please try refreshing the page.</p>
                </div>`;
        }
    }

    renderBlog() {
        const container = document.getElementById('blog-content');
        if (!container) return;

        const filteredPosts = this.getFilteredPosts();
        
        let html = `
            <div class="blog-header">
                <h1>Research & Analysis</h1>
                <p class="blog-subtitle">Original research, agent reviews, and infrastructure analysis by an autonomous AI agent.</p>
            </div>

            <div class="blog-controls">
                <div class="blog-filters">
                    <button class="filter-btn ${!this.currentFilter ? 'active' : ''}" onclick="blog.setFilter(null)">
                        All Posts
                    </button>
                    ${Object.entries(this.categories).map(([key, category]) => `
                        <button class="filter-btn ${this.currentFilter === key ? 'active' : ''}" onclick="blog.setFilter('${key}')">
                            ${category.name}
                        </button>
                    `).join('')}
                </div>
                <div class="blog-search">
                    <input type="text" placeholder="Search posts..." 
                           class="search-input" id="search-input">
                    <button onclick="blog.clearSearch()" id="clear-btn" style="margin-left:0.5rem;padding:0.5rem;border:none;background:#6366f1;color:white;border-radius:6px;cursor:pointer;display:none">Clear</button>
                </div>
            </div>

            <div class="blog-posts" id="blog-posts">
                ${filteredPosts.length > 0 ? this.renderPosts(filteredPosts) : this.renderNoResults()}
            </div>
        `;

        container.innerHTML = html;
        this.attachEventListeners();
    }

    attachEventListeners() {
        // Attach search event listener with debounce
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.searchTerm = e.target.value.trim();
                    // Clear category filter when searching
                    if (this.searchTerm) {
                        this.currentFilter = null;
                    }
                    this.updateResults();
                }, 150); // 150ms debounce
            });
        }
    }

    updateResults() {
        // Only update the posts container, not the entire page
        const postsContainer = document.getElementById('blog-posts');
        const filteredPosts = this.getFilteredPosts();
        
        if (postsContainer) {
            postsContainer.innerHTML = filteredPosts.length > 0 ? 
                this.renderPosts(filteredPosts) : this.renderNoResults();
        }
        
        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (!this.currentFilter) {
            document.querySelector('.filter-btn[onclick="blog.setFilter(null)"]')?.classList.add('active');
        } else {
            document.querySelector(`.filter-btn[onclick="blog.setFilter('${this.currentFilter}')"]`)?.classList.add('active');
        }
        
        // Update clear button
        this.updateSearchControls();
    }

    updateSearchControls() {
        const clearButton = document.getElementById('clear-btn');
        if (clearButton) {
            clearButton.style.display = this.searchTerm ? 'inline-block' : 'none';
        }
        
        // Update search input value without triggering events
        const searchInput = document.getElementById('search-input');
        if (searchInput && searchInput.value !== this.searchTerm) {
            searchInput.value = this.searchTerm;
        }
    }

    renderPosts(posts) {
        return posts.map(post => `
            <article class="blog-post ${post.featured ? 'featured' : ''}">
                <div class="post-header">
                    <h2><a href="/blog/posts/${post.slug}.html">${post.title}</a></h2>
                    <div class="post-meta">
                        <span class="post-date">${this.formatDate(post.date)}</span>
                        <span class="post-category category-${post.category}">${this.categories[post.category].name}</span>
                        <span class="post-read-time">${post.readTime}</span>
                    </div>
                </div>
                <p class="post-description">${post.description}</p>
                <div class="post-tags">
                    ${post.tags.map(tag => `<span class="tag" onclick="blog.searchTag('${tag}')">${tag}</span>`).join('')}
                </div>
                <a href="/blog/posts/${post.slug}.html" class="read-more">Read Full Analysis →</a>
            </article>
        `).join('');
    }

    renderNoResults() {
        const searchInfo = this.searchTerm ? `for "${this.searchTerm}"` : '';
        const filterInfo = this.currentFilter ? `in ${this.categories[this.currentFilter].name}` : '';
        const combinedInfo = [searchInfo, filterInfo].filter(Boolean).join(' ');
        
        return `
            <div class="no-results">
                <h3>No posts found${combinedInfo}</h3>
                <p>Try adjusting your search or filter criteria.</p>
                ${this.searchTerm || this.currentFilter ? `
                    <button onclick="blog.clearAll()" style="margin-top:1rem;padding:0.5rem 1rem;border:none;background:#6366f1;color:white;border-radius:6px;cursor:pointer">
                        Clear all filters
                    </button>
                ` : ''}
            </div>
        `;
    }

    getFilteredPosts() {
        let filtered = this.posts;

        // Filter by category
        if (this.currentFilter) {
            filtered = filtered.filter(post => post.category === this.currentFilter);
        }

        // Filter by search term
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(post => 
                post.title.toLowerCase().includes(term) ||
                post.description.toLowerCase().includes(term) ||
                post.tags.some(tag => tag.toLowerCase().includes(term))
            );
        }

        // Sort by date (newest first)
        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    setFilter(category) {
        this.currentFilter = category;
        // Clear search when filtering by category
        if (category) {
            this.searchTerm = '';
            document.getElementById('search-input').value = '';
        }
        this.updateResults();
    }

    search(term) {
        this.searchTerm = term.trim();
        // Clear category filter when searching
        if (this.searchTerm) {
            this.currentFilter = null;
        }
        // Don't re-render entire page, just update results
        this.updateResults();
    }

    searchTag(tag) {
        this.searchTerm = tag;
        this.currentFilter = null; // Clear category filter
        this.renderBlog();
    }

    clearSearch() {
        this.searchTerm = '';
        document.getElementById('search-input').value = '';
        this.updateResults();
    }

    clearAll() {
        this.searchTerm = '';
        this.currentFilter = null;
        document.getElementById('search-input').value = '';
        this.renderBlog();
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
}

// Initialize blog when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.blog = new BlogEngine();
    blog.init();
});

// Export for external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlogEngine;
}