import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [postContent, setPostContent] = useState('');
  const [blueskyContent, setBlueskyContent] = useState('');
  const [platforms, setPlatforms] = useState({
    mastodon: true,
    bluesky: true,
    linkedin: true
  });
  const [isPosting, setIsPosting] = useState(false);
  const [result, setResult] = useState(null);
  const [config, setConfig] = useState(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [hashtags, setHashtags] = useState([]);
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const fileInputRef = useRef(null);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestTopic, setSuggestTopic] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchStatus, setSearchStatus] = useState(null);
  const [isShortening, setIsShortening] = useState(false);

  // Load configuration on component mount
  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/config');
        const configData = await response.json();
        setConfig(configData);
      } catch (error) {
        console.error('Failed to load configuration:', error);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadConfig();
  }, []);

  const handlePlatformChange = (platform) => {
    setPlatforms(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + selectedImages.length > 4) {
      alert('Maximum 4 images allowed');
      return;
    }

    setSelectedImages(prev => [...prev, ...files]);
    
    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews(prev => [...prev, {
          file,
          url: e.target.result,
          id: Math.random().toString(36).substr(2, 9)
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id) => {
    const preview = imagePreviews.find(p => p.id === id);
    if (preview) {
      setSelectedImages(prev => prev.filter(img => img !== preview.file));
      setImagePreviews(prev => prev.filter(p => p.id !== id));
    }
  };

  // Popular hashtag suggestions
  const popularHashtags = [
    '#socialmedia', '#marketing', '#tech', '#startup', '#business',
    '#photography', '#art', '#design', '#coding', '#webdev',
    '#ai', '#machinelearning', '#productivity', '#entrepreneur', '#innovation'
  ];

  const addHashtag = (tag) => {
    if (!hashtags.includes(tag)) {
      setHashtags(prev => [...prev, tag]);
      setPostContent(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + tag + ' ');
    }
    setShowHashtagSuggestions(false);
  };

  const removeHashtag = (tagToRemove) => {
    setHashtags(prev => prev.filter(tag => tag !== tagToRemove));
    setPostContent(prev => prev.replace(new RegExp(`\\s*${tagToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), ' ').trim());
  };

  // Parse hashtags from content
  React.useEffect(() => {
    const hashtagRegex = /#[\w]+/g;
    const foundHashtags = postContent.match(hashtagRegex) || [];
    setHashtags(foundHashtags);
  }, [postContent]);

  const handleGetSuggestions = async () => {
    if (!suggestTopic.trim()) return;
    
    setIsLoadingSuggestions(true);
    try {
      const response = await fetch('http://localhost:5000/api/suggest-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic: suggestTopic }),
      });
      
      const data = await response.json();
      if (data.success) {
        setSuggestions(data.suggestions);
        setSearchStatus(data.searchStatus);
      } else {
        alert(data.error || 'Failed to generate suggestions');
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Failed to generate suggestions. Make sure the server is running and OpenAI is configured.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };
  
  const handleShortenForBluesky = async () => {
    if (!postContent.trim()) return;
    
    setIsShortening(true);
    try {
      const response = await fetch('http://localhost:5000/api/shorten-for-bluesky', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: postContent }),
      });
      
      const data = await response.json();
      if (data.success) {
        setBlueskyContent(data.content);
      } else {
        alert('Failed to shorten content: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error shortening for Bluesky:', error);
      alert('Failed to shorten content. Make sure the server is running.');
    } finally {
      setIsShortening(false);
    }
  };

  const handleSelectSuggestion = (suggestion) => {
    setPostContent(suggestion);
    setBlueskyContent(''); // Clear Bluesky content - user can click "Auto-shorten" if needed
    setShowSuggestModal(false);
    setSuggestions([]);
    setSuggestTopic('');
    setSearchStatus(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!postContent.trim()) return;

    setIsPosting(true);
    setResult(null);

    try {
      const selectedPlatforms = Object.entries(platforms)
        .filter(([_, selected]) => selected)
        .map(([platform]) => platform);

      const formData = new FormData();
      formData.append('content', postContent);
      formData.append('blueskyContent', blueskyContent || postContent);
      formData.append('platforms', JSON.stringify(selectedPlatforms));
      
      // Add images to form data
      selectedImages.forEach((image, index) => {
        formData.append(`images`, image);
      });

      const response = await fetch('http://localhost:5000/api/posts', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
      if (data.success) {
        setPostContent('');
        setBlueskyContent('');
        setSelectedImages([]);
        setImagePreviews([]);
      }
    } catch (error) {
      console.error('Error:', error);
      setResult({ success: false, error: error.message });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Social Poster</h1>
        <p>Create and share your posts across multiple platforms</p>
      </header>

      <main className="app-main">
        {config && (!config.mastodon.configured || !config.bluesky.configured) && (
          <div className="config-warning">
            <h3>⚠️ Configuration Required</h3>
            <p>To post to social media platforms, you need to configure API credentials:</p>
            <ul>
              {!config.mastodon.configured && (
                <li>Mastodon: Add your access token to the server's .env file</li>
              )}
              {!config.bluesky.configured && (
                <li>Bluesky: Add your identifier and app password to the server's .env file</li>
              )}
            </ul>
            <p>See the README.md file for detailed setup instructions.</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="post-form">
          <div className="suggest-section">
            <button 
              type="button" 
              className="suggest-post-btn"
              onClick={() => setShowSuggestModal(true)}
            >
              ✨ Get AI Suggestions
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="linkedin-mastodon-content" className="platform-label">
              <strong>LinkedIn & Mastodon</strong> (500 characters max)
            </label>
            <textarea
              id="linkedin-mastodon-content"
              value={postContent}
              onChange={(e) => {
                setPostContent(e.target.value);
                // Clear notification when user starts typing a new post
                if (result) {
                  setResult(null);
                }
              }}
              placeholder="What's on your mind?"
              rows="5"
              maxLength="500"
              disabled={isPosting}
              required
            />
            <div className="character-count">
              {postContent.length}/500 characters
            </div>
          </div>

          <div className="form-group">
            <div className="label-with-button">
              <label htmlFor="bluesky-content" className="platform-label">
                <strong>Bluesky</strong> (300 characters max)
              </label>
              <button
                type="button"
                className="shorten-btn"
                onClick={handleShortenForBluesky}
                disabled={!postContent.trim() || isShortening || isPosting}
                title="AI-shorten the LinkedIn/Mastodon post for Bluesky"
              >
                {isShortening ? '✨ Shortening...' : '✨ Auto-shorten'}
              </button>
            </div>
            <textarea
              id="bluesky-content"
              value={blueskyContent}
              onChange={(e) => {
                setBlueskyContent(e.target.value);
                // Clear notification when user starts typing a new post
                if (result) {
                  setResult(null);
                }
              }}
              placeholder="Shorter version for Bluesky (click 'Auto-shorten' button to generate)"
              rows="4"
              maxLength="300"
              disabled={isPosting}
            />
            <div className="character-count">
              {blueskyContent.length}/300 characters
            </div>
          </div>

          {/* Hashtag Section */}
          <div className="hashtag-section">
            <div className="hashtag-header">
              <span>Hashtags ({hashtags.length})</span>
              <button 
                type="button" 
                className="hashtag-suggest-btn"
                onClick={() => setShowHashtagSuggestions(!showHashtagSuggestions)}
              >
                💡 Suggest
              </button>
            </div>
            
            {/* Current hashtags */}
            {hashtags.length > 0 && (
              <div className="current-hashtags">
                {hashtags.map((tag, index) => (
                  <span key={index} className="hashtag-chip">
                    {tag}
                    <button 
                      type="button" 
                      onClick={() => removeHashtag(tag)}
                      className="hashtag-remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Hashtag suggestions */}
            {showHashtagSuggestions && (
              <div className="hashtag-suggestions">
                <div className="suggestions-header">Popular hashtags:</div>
                <div className="suggestions-grid">
                  {popularHashtags.map((tag, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`suggestion-tag ${hashtags.includes(tag) ? 'used' : ''}`}
                      onClick={() => addHashtag(tag)}
                      disabled={hashtags.includes(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="image-upload-section">
            <button type="button" className="image-upload-btn" onClick={() => fileInputRef.current?.click()}>
              📷 Add Images ({selectedImages.length}/4)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            
            {imagePreviews.length > 0 && (
              <div className="image-previews">
                {imagePreviews.map((preview) => (
                  <div key={preview.id} className="image-preview">
                    <img src={preview.url} alt="Preview" />
                    <button
                      type="button"
                      className="remove-image"
                      onClick={() => removeImage(preview.id)}
                      disabled={isPosting}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="platform-selection">
            {isLoadingConfig ? (
              <div className="loading-config">Loading configuration...</div>
            ) : (
              <>
                <label className="platform-option">
                  <input
                    type="checkbox"
                    checked={platforms.mastodon}
                    onChange={() => handlePlatformChange('mastodon')}
                    disabled={isPosting}
                  />
                  <span className={`platform-name ${config && !config.mastodon.configured ? 'unconfigured' : ''}`}>
                    Mastodon
                  </span>
                </label>
                <label className="platform-option">
                  <input
                    type="checkbox"
                    checked={platforms.bluesky}
                    onChange={() => handlePlatformChange('bluesky')}
                    disabled={isPosting}
                  />
                  <span className={`platform-name ${config && !config.bluesky.configured ? 'unconfigured' : ''}`}>
                    Bluesky
                  </span>
                </label>

                <label className="platform-option">
                  <input
                    type="checkbox"
                    checked={platforms.linkedin}
                    onChange={() => handlePlatformChange('linkedin')}
                    disabled={isPosting}
                  />
                  <span className={`platform-name ${config && !config.linkedin.configured ? 'unconfigured' : ''}`}>
                    LinkedIn
                  </span>
                </label>
              </>
            )}
          </div>

          <button
            type="submit"
            className="post-button"
            disabled={isPosting || !Object.values(platforms).some(Boolean)}
          >
            {isPosting ? 'Posting...' : 'Post to Selected Platforms'}
          </button>
        </form>

        {result && (
          <div className={`result ${result.partial ? 'partial' : result.success ? (result.results?.some(r => r.devInfo) ? 'testing' : 'success') : 'error'}`}>
            {result.partial ? (
              <>
                <h3>Partial Success</h3>
                <p>Some posts succeeded, others failed:</p>
                <ul>
                  {result.results?.map((r, i) => (
                    <li key={i} className={r.success ? (r.devInfo ? 'testing-item' : 'success-item') : 'error-item'}>
                      <strong>{r.platform}:</strong> {r.message}
                      {r.devInfo && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                          <div><strong>Network:</strong> {r.devInfo.network}</div>
                          <div><strong>Content:</strong> {r.devInfo.content}</div>
                          <div><strong>Credentials:</strong></div>
                          <ul style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                            {Object.entries(r.devInfo.credentials).map(([key, value]) => (
                              <li key={key}><strong>{key}:</strong> {value}</li>
                            ))}
                          </ul>
                          {r.hashtag_analytics && (
                            <div className="hashtag-analytics">
                              <strong>Hashtag Analytics:</strong>
                              <ul>
                                <li>Total hashtags: {r.hashtag_analytics.total_hashtags}</li>
                                <li>Hashtags: {r.hashtag_analytics.hashtags.join(', ') || 'None'}</li>
                                <li>Density: {(r.hashtag_analytics.hashtag_density * 100).toFixed(1)}%</li>
                                {r.hashtag_analytics.suggestions.length > 0 && (
                                  <li>Suggestions: {r.hashtag_analytics.suggestions.join(', ')}</li>
                                )}
                              </ul>
                            </div>
                          )}
                          {r.hashtag_validation && (
                            <div className="hashtag-validation">
                              <strong>Hashtag Validation:</strong>
                              <ul>
                                <li>Valid: {r.hashtag_validation.valid.length}</li>
                                {r.hashtag_validation.invalid.length > 0 && (
                                  <li>Invalid: {r.hashtag_validation.invalid.join(', ')}</li>
                                )}
                                {r.hashtag_validation.warnings.length > 0 && (
                                  <li>Warnings: {r.hashtag_validation.warnings.join(', ')}</li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : result.success ? (
              <>
                <h3>{result.results?.some(r => r.devInfo) ? 'Testing!' : 'Success!'}</h3>
                <ul>
                  {result.results?.map((r, i) => (
                    <li key={i} className={r.devInfo ? 'testing-item' : 'success-item'}>
                      <strong>{r.platform}:</strong> {r.message}
                      {r.devInfo && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                          <div><strong>Network:</strong> {r.devInfo.network}</div>
                          <div><strong>Content:</strong> {r.devInfo.content}</div>
                          <div><strong>Credentials:</strong></div>
                          <ul style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                            {Object.entries(r.devInfo.credentials).map(([key, value]) => (
                              <li key={key}><strong>{key}:</strong> {value}</li>
                            ))}
                          </ul>
                          {r.hashtag_analytics && (
                            <div className="hashtag-analytics">
                              <strong>Hashtag Analytics:</strong>
                              <ul>
                                <li>Total hashtags: {r.hashtag_analytics.total_hashtags}</li>
                                <li>Hashtags: {r.hashtag_analytics.hashtags.join(', ') || 'None'}</li>
                                <li>Density: {(r.hashtag_analytics.hashtag_density * 100).toFixed(1)}%</li>
                                {r.hashtag_analytics.suggestions.length > 0 && (
                                  <li>Suggestions: {r.hashtag_analytics.suggestions.join(', ')}</li>
                                )}
                              </ul>
                            </div>
                          )}
                          {r.hashtag_validation && (
                            <div className="hashtag-validation">
                              <strong>Hashtag Validation:</strong>
                              <ul>
                                <li>Valid: {r.hashtag_validation.valid.length}</li>
                                {r.hashtag_validation.invalid.length > 0 && (
                                  <li>Invalid: {r.hashtag_validation.invalid.join(', ')}</li>
                                )}
                                {r.hashtag_validation.warnings.length > 0 && (
                                  <li>Warnings: {r.hashtag_validation.warnings.join(', ')}</li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h3>Error</h3>
                <p>{result.error || 'Failed to post'}</p>
                {result.results && result.results.length > 0 && (
                  <ul>
                    {result.results.map((r, i) => (
                      <li key={i}>
                        <strong>{r.platform}:</strong> {r.message}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>© {new Date().getFullYear()} Social Poster</p>
      </footer>

      {/* AI Suggestions Modal */}
      {showSuggestModal && (
        <div className="modal-overlay" onClick={() => {
          setShowSuggestModal(false);
          setSearchStatus(null);
          setSuggestions([]);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✨ AI Post Suggestions</h2>
              <button 
                className="modal-close"
                onClick={() => {
                  setShowSuggestModal(false);
                  setSearchStatus(null);
                  setSuggestions([]);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="topic-input-section">
                <label htmlFor="topic">What's your topic?</label>
                <input
                  id="topic"
                  type="text"
                  value={suggestTopic}
                  onChange={(e) => setSuggestTopic(e.target.value)}
                  placeholder="e.g., recycling 3d prints"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleGetSuggestions();
                    }
                  }}
                />
                <button 
                  className="generate-btn"
                  onClick={handleGetSuggestions}
                  disabled={!suggestTopic.trim() || isLoadingSuggestions}
                >
                  {isLoadingSuggestions ? 'Generating...' : 'Generate Suggestions'}
                </button>
              </div>

              {searchStatus && (
                <div className={`search-status ${searchStatus.success ? 'success' : 'info'}`}>
                  {searchStatus.success ? '🔍' : 'ℹ️'} {searchStatus.message}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="suggestions-list">
                  <h3>Choose a suggestion:</h3>
                  {suggestions.map((suggestion, index) => (
                    <div 
                      key={index} 
                      className="suggestion-card"
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <div className="suggestion-number">{index + 1}</div>
                      <div className="suggestion-text">{suggestion}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
