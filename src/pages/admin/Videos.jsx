import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { getYouTubeId } from '../../shared/video'
import {
  Plus, Edit2, Trash2, X, Search, Youtube,
  ExternalLink, Video, Upload, CheckCircle2, Film
} from 'lucide-react'

const VIDEO_CATEGORIES = ['Crop Advisory', 'Product Demo', 'How-To Guide', 'Pest Identification', 'Testimonial', 'General']

const emptyForm = {
  title: '',
  description: '',
  url: '',
  category: 'Crop Advisory',
  tags: '',
  thumbnailUrl: ''
}

export default function AdminVideos() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [modalOpen, setModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [uploadMode, setUploadMode] = useState('file') // 'file' or 'url'
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchVideos()
  }, [])

  const fetchVideos = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/videos')
      if (data.success) setVideos(data.data || [])
    } catch {
      toast.error('Failed to load videos')
    } finally {
      setLoading(false)
    }
  }

  const isUploadedVideo = (url) => {
    if (!url) return false
    return url.startsWith('/api/upload') || url.startsWith('data:video') || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)
  }

  const getYouTubeThumbnail = (url) => {
    const id = getYouTubeId(url)
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
  }

  const openCreate = () => {
    setIsEditing(null)
    setForm(emptyForm)
    setUploadMode('file')
    setModalOpen(true)
  }

  const openEdit = (video) => {
    setIsEditing(video._id || video.id)
    const videoUrl = video.videoUrl || video.url || ''
    setForm({
      title: video.title || '',
      description: video.description || '',
      url: videoUrl,
      category: video.category || 'Crop Advisory',
      tags: Array.isArray(video.tags) ? video.tags.join(', ') : (video.tags || ''),
      thumbnailUrl: video.thumbnailUrl || video.thumbnail || ''
    })
    setUploadMode(isUploadedVideo(videoUrl) ? 'file' : 'url')
    setModalOpen(true)
  }

  const handleVideoFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      toast.error('Please select a valid video file (MP4, WebM, OGG, or MOV)')
      return
    }

    if (file.size > 150 * 1024 * 1024) {
      toast.error('Video file size exceeds 150MB. Please choose a smaller video or paste a YouTube link.')
      return
    }

    setUploading(true)
    setUploadProgress(20)
    try {
      const reader = new FileReader()
      reader.onprogress = (pe) => {
        if (pe.lengthComputable) {
          setUploadProgress(Math.round((pe.loaded / pe.total) * 60))
        }
      }
      reader.onload = async () => {
        setUploadProgress(70)
        try {
          const { data } = await axios.post('/api/upload', {
            filename: file.name,
            contentType: file.type,
            data: reader.result
          })
          setUploadProgress(100)
          if (data.success && data.url) {
            setForm(f => ({
              ...f,
              url: data.url,
              title: f.title.trim() ? f.title : file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
            }))
            toast.success('Video file uploaded successfully! 🎬')
          }
        } catch (uploadErr) {
          toast.error(uploadErr.response?.data?.message || 'Failed to upload video to server')
        } finally {
          setUploading(false)
          setUploadProgress(0)
        }
      }
      reader.onerror = () => {
        toast.error('Failed to read video file')
        setUploading(false)
        setUploadProgress(0)
      }
      reader.readAsDataURL(file)
    } catch {
      toast.error('Failed to upload video')
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Video title is required'); return }
    if (!form.url.trim()) { toast.error('Please upload a video file or enter a video URL'); return }

    const ytId = getYouTubeId(form.url)
    const computedThumb = form.thumbnailUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '')

    const payload = {
      ...form,
      videoUrl: form.url.trim(),
      url: form.url.trim(),
      thumbnailUrl: computedThumb,
      thumbnail: computedThumb,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    }

    try {
      if (isEditing) {
        const { data } = await axios.put(`/api/videos/${isEditing}`, payload)
        if (data.success) {
          toast.success('Video updated successfully!')
          setVideos(prev => prev.map(v => (v._id === isEditing || v.id === isEditing) ? data.data : v))
        }
      } else {
        const { data } = await axios.post('/api/videos', payload)
        if (data.success) {
          toast.success('Video added successfully! Ready to link in products and blogs.')
          setVideos(prev => [data.data, ...prev])
        }
      }
      setModalOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this video?')) return
    try {
      await axios.delete(`/api/videos/${id}`)
      toast.success('Video deleted')
      setVideos(prev => prev.filter(v => v._id !== id && v.id !== id))
    } catch {
      toast.error('Delete failed')
    }
  }

  const filtered = videos.filter(v => {
    const matchesSearch = !search.trim() ||
      (v.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(v.tags) && v.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
    const matchesCategory = categoryFilter === 'All' || v.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Film size={26} style={{ color: '#16a34a' }} />
            Video Management &amp; Demos
          </h1>
          <p className="page-subtitle">Upload agronomy demonstration videos and attach them to products and blogs</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Add / Upload Video
        </button>
      </div>

      {/* Controls: Search & Category */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search videos by title or tags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-control"
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '180px' }}
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="All">All Categories</option>
          {VIDEO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Videos', value: videos.length, icon: '🎬', bg: '#f0fdf4', color: '#15803d' },
          { label: 'Uploaded Videos', value: videos.filter(v => isUploadedVideo(v.url || v.videoUrl)).length, icon: '📤', bg: '#eff6ff', color: '#1d4ed8' },
          { label: 'YouTube Links', value: videos.filter(v => getYouTubeId(v.url || v.videoUrl)).length, icon: '▶️', bg: '#fee2e2', color: '#b91c1c' },
          { label: 'Categories', value: [...new Set(videos.map(v => v.category))].length, icon: '📂', bg: '#fef3c7', color: '#b45309' }
        ].map(stat => (
          <div key={stat.label} style={{ background: stat.bg, borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '26px' }}>{stat.icon}</span>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Video Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>Loading videos...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', background: '#f9fafb', borderRadius: '18px', border: '1px dashed #d1d5db' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎬</div>
          <h3 style={{ fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>No Videos Found</h3>
          <p style={{ color: '#6b7280', marginBottom: '20px' }}>Upload direct video files or add YouTube links to attach them below products and blogs.</p>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Add First Video
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '22px' }}>
          {filtered.map(video => {
            const rawUrl = video.videoUrl || video.url || ''
            const ytId = getYouTubeId(rawUrl)
            const isUpload = isUploadedVideo(rawUrl)
            const thumb = video.thumbnailUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null)
            const vid = video._id || video.id

            return (
              <div key={vid} style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
                {/* Media Preview / Thumbnail */}
                <div style={{ height: '180px', background: '#090d16', position: 'relative', overflow: 'hidden' }}>
                  {isUpload ? (
                    <video
                      src={rawUrl}
                      controls
                      preload="metadata"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                    />
                  ) : thumb ? (
                    <>
                      <img src={thumb} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <a href={rawUrl} target="_blank" rel="noreferrer" style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(220,38,38,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', textDecoration: 'none' }}>
                          <span style={{ color: '#fff', fontSize: '20px', paddingLeft: '4px' }}>▶</span>
                        </a>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                      <Video size={48} />
                    </div>
                  )}

                  {/* Badges */}
                  <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,255,255,0.95)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, color: '#1e293b' }}>
                    {video.category || 'General'}
                  </div>
                  <div style={{ position: 'absolute', top: '10px', right: '10px', background: isUpload ? '#15803d' : '#dc2626', color: '#fff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700 }}>
                    {isUpload ? 'FILE UPLOAD' : 'YOUTUBE'}
                  </div>
                </div>

                {/* Video Info */}
                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a', marginBottom: '6px', lineHeight: 1.4 }}>{video.title}</h3>
                  {video.description && <p style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '10px', flex: 1 }}>{video.description.slice(0, 110)}{video.description.length > 110 ? '…' : ''}</p>}

                  {Array.isArray(video.tags) && video.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px' }}>
                      {video.tags.slice(0, 4).map((tag, i) => (
                        <span key={i} style={{ background: '#f0fdf4', color: '#166534', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px' }}>#{tag}</span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #f8fafc' }}>
                    <a href={rawUrl} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                      <ExternalLink size={13} /> {isUpload ? 'Open Video' : 'Watch'}
                    </a>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => openEdit(video)} title="Edit video">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(vid)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }} title="Delete video">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Video Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div style={{ padding: '22px 28px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Video size={22} style={{ color: '#16a34a' }} />
                {isEditing ? 'Edit Video' : 'Add or Upload Video'}
              </h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', display: 'grid', gap: '18px' }}>
              {/* Method Switcher: Upload File vs Paste URL */}
              <div>
                <label className="form-label" style={{ marginBottom: '8px' }}>Video Source Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setUploadMode('file')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: uploadMode === 'file' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                      background: uploadMode === 'file' ? '#f0fdf4' : '#fff',
                      color: uploadMode === 'file' ? '#15803d' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.88rem'
                    }}
                  >
                    <Upload size={16} /> Upload Video File (MP4 / WebM)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('url')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: uploadMode === 'url' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                      background: uploadMode === 'url' ? '#fef2f2' : '#fff',
                      color: uploadMode === 'url' ? '#dc2626' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.88rem'
                    }}
                  >
                    <Youtube size={16} /> YouTube / Online Link
                  </button>
                </div>
              </div>

              {/* Upload File Mode */}
              {uploadMode === 'file' ? (
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    style={{ display: 'none' }}
                    onChange={handleVideoFileUpload}
                  />
                  <div style={{ textAlign: 'center' }}>
                    <Upload size={32} style={{ color: '#16a34a', marginBottom: '8px' }} />
                    <p style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                      {uploading ? `Uploading video... (${uploadProgress}%)` : 'Select an MP4 or WebM video from your device'}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '14px' }}>
                      Recommended: 720p or 1080p MP4 up to 150MB
                    </p>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                    >
                      {uploading ? 'Processing File...' : form.url && isUploadedVideo(form.url) ? 'Choose Another Video File' : 'Browse Video File'}
                    </button>
                  </div>

                  {form.url && isUploadedVideo(form.url) && (
                    <div style={{ marginTop: '16px', background: '#fff', borderRadius: '10px', padding: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px' }}>
                        <CheckCircle2 size={16} /> Video Ready:
                      </div>
                      <video
                        src={form.url}
                        controls
                        style={{ width: '100%', maxHeight: '180px', borderRadius: '8px', background: '#000' }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Paste URL Mode */
                <div>
                  <label className="form-label">Video URL or YouTube Link *</label>
                  <input
                    className="form-control"
                    placeholder="https://www.youtube.com/watch?v=... or https://..."
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  />
                  {form.url && getYouTubeId(form.url) && (
                    <div style={{ marginTop: '10px', borderRadius: '10px', overflow: 'hidden', height: '150px' }}>
                      <img src={`https://img.youtube.com/vi/${getYouTubeId(form.url)}/hqdefault.jpg`} alt="thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="form-label">Video Title *</label>
                <input
                  className="form-control"
                  placeholder="e.g. Field application guide &amp; dosage"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Category & Tags */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {VIDEO_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="form-control" placeholder="e.g. Paddy, Blast, Fungicide" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="form-label">Description (optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Detailed guidance or summary of what this video demonstrates..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '18px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: '#f8fafc', borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Video size={16} />
                {isEditing ? 'Update Video' : 'Save Video'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
