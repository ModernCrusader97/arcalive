import { useState, useEffect, useCallback } from 'react'
import { auth, channels, posts, comments, upload } from './api'
import type { Channel, Post, Comment, User } from './api'
import './App.css'

function formatDate(s: string) {
  const d = new Date(s)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400 && d.getDate() === now.getDate()) return d.toTimeString().slice(0, 5)
  return `${d.getMonth() + 1}.${d.getDate()}`
}

// Auth Modal
function AuthModal({ onClose, onLogin }: { onClose: () => void; onLogin: (u: User, t: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    try {
      if (mode === 'login') {
        const res = await auth.login({ email, password })
        localStorage.setItem('token', res.data.token)
        onLogin(res.data.user, res.data.token)
      } else {
        await auth.register({ username, email, password })
        const res = await auth.login({ email, password })
        localStorage.setItem('token', res.data.token)
        onLogin(res.data.user, res.data.token)
      }
    } catch (e: any) {
      setError(e.response?.data?.error || '오류가 발생했습니다')
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>
        {mode === 'register' && (
          <div className="form-row">
            <label>닉네임</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="2~20자" />
          </div>
        )}
        <div className="form-row">
          <label>이메일</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
        </div>
        <div className="form-row">
          <label>비밀번호</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="6자 이상" />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button className="btn btn-pink" onClick={submit}>
            {mode === 'login' ? '로그인' : '가입'}
          </button>
        </div>
        <div className="modal-switch">
          {mode === 'login'
            ? <>계정이 없으신가요? <span onClick={() => setMode('register')}>회원가입</span></>
            : <>이미 계정이 있으신가요? <span onClick={() => setMode('login')}>로그인</span></>}
        </div>
      </div>
    </div>
  )
}

// Post List Page
function PostList({ channel, user: _user, onPost }: { channel: Channel; user: User | null; onPost: (id: number) => void }) {
  const [postList, setPostList] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await posts.list(channel.slug, p)
      setPostList(res.data.posts)
      setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [channel.slug])

  useEffect(() => { setPage(1); load(1) }, [load])

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="main">
      <div className="board-header">
        <div>
          <div className="board-title">{channel.name}</div>
          {channel.description && <div className="board-desc">{channel.description}</div>}
        </div>
      </div>
      <div className="write-bar">
        <button className="btn btn-pink btn-sm" onClick={() => onPost(0)}>글쓰기</button>
      </div>
      {loading ? <div className="loading">불러오는 중...</div> : (
        <>
          <table className="post-table">
            <thead>
              <tr>
                <th className="post-num">번호</th>
                <th>제목</th>
                <th className="post-author">작성자</th>
                <th className="post-date">날짜</th>
                <th className="post-likes">추천</th>
              </tr>
            </thead>
            <tbody>
              {postList.length === 0 ? (
                <tr><td colSpan={5} className="empty">게시글이 없습니다</td></tr>
              ) : postList.map((p, i) => (
                <tr key={p.id} onClick={() => onPost(p.id)} style={{ cursor: 'pointer' }}>
                  <td className="post-num">{total - (page - 1) * 20 - i}</td>
                  <td className="post-title-cell">
                    <span className="post-title-link">{p.title}</span>
                    {p.comment_count > 0 && <span className="comment-count">[{p.comment_count}]</span>}
                  </td>
                  <td className="post-author">{p.username || p.guest_name || '익명'}</td>
                  <td className="post-date">{formatDate(p.created_at)}</td>
                  <td className="post-likes">{p.likes > 0 ? `+${p.likes}` : p.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn${p === page ? ' active' : ''}`}
                  onClick={() => { setPage(p); load(p) }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Post View Page
function PostView({ postId, user, onBack }: { postId: number; user: User | null; onBack: () => void }) {
  const [post, setPost] = useState<Post | null>(null)
  const [commentList, setCommentList] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [votes, setVotes] = useState({ likes: 0, dislikes: 0 })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [pr, cr] = await Promise.all([posts.get(postId), comments.list(postId)])
        setPost(pr.data)
        setVotes({ likes: pr.data.likes, dislikes: pr.data.dislikes })
        setCommentList(cr.data || [])
      } finally { setLoading(false) }
    }
    load()
  }, [postId])

  const vote = async (v: 1 | -1) => {
    try {
      const res = await posts.vote(postId, v)
      setVotes(res.data)
    } catch {}
  }

  const submitComment = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      const data: any = { content }
      if (!user) { data.guest_name = guestName || '익명'; data.guest_password = guestPw || '0000' }
      await comments.create(postId, data)
      const cr = await comments.list(postId)
      setCommentList(cr.data || [])
      setContent('')
      setPost(p => p ? { ...p, comment_count: p.comment_count + 1 } : p)
    } catch {} finally { setSubmitting(false) }
  }

  if (loading) return <div className="loading">불러오는 중...</div>
  if (!post) return <div className="empty">게시글을 찾을 수 없습니다</div>

  const allComments: Comment[] = []
  const renderComments = (list: Comment[], _isReply = false) => {
    list.forEach(c => {
      allComments.push(c)
      if (c.replies?.length) renderComments(c.replies, true)
    })
  }
  renderComments(commentList)

  return (
    <div className="main">
      <div className="post-view">
        <div className="post-view-header">
          <div className="post-view-title">{post.title}</div>
          <div className="post-view-meta">
            <span>작성자: <strong>{post.username || post.guest_name || '익명'}</strong></span>
            <span>{new Date(post.created_at).toLocaleString('ko-KR')}</span>
            <span>추천 {votes.likes}</span>
            <span>댓글 {post.comment_count}</span>
          </div>
        </div>
        <div className="post-view-body">
          {post.content}
          {post.image_urls?.map((url, i) => (
            <img key={i} src={url} alt="" />
          ))}
        </div>
        <div className="post-vote">
          <button className="vote-btn up" onClick={() => vote(1)}>
            👍 추천 {votes.likes}
          </button>
          <button className="vote-btn down" onClick={() => vote(-1)}>
            👎 비추 {votes.dislikes}
          </button>
        </div>
        <div className="post-back">
          <button className="btn" onClick={onBack}>목록으로</button>
        </div>
      </div>

      <div className="comment-section">
        <div className="comment-header">댓글 {post.comment_count}개</div>
        {allComments.length === 0
          ? <div className="comment-empty">첫 댓글을 남겨보세요!</div>
          : allComments.map(c => (
            <div key={c.id} className={`comment-item${c.parent_id ? ' reply' : ''}`}>
              <div className="comment-meta">
                {c.parent_id && <span>↳</span>}
                <span className="comment-author">{c.username || c.guest_name || '익명'}</span>
                <span>{formatDate(c.created_at)}</span>
              </div>
              <div className="comment-content">{c.content}</div>
            </div>
          ))
        }
        <div className="comment-form">
          <div className="comment-form-title">댓글 작성</div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="댓글을 입력하세요..." />
          <div className="comment-form-row">
            {!user && (
              <>
                <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="닉네임" />
                <input type="password" value={guestPw} onChange={e => setGuestPw(e.target.value)} placeholder="비밀번호" />
              </>
            )}
            <button className="btn btn-pink btn-sm comment-form-submit" onClick={submitComment} disabled={submitting}>
              {submitting ? '...' : '등록'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Write Page
function WritePost({ channel, user, onDone, onCancel }: {
  channel: Channel; user: User | null; onDone: (id: number) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await upload.image(file)
      setImageUrls(prev => [...prev, url])
    } catch {
      setError('이미지 업로드 실패')
    } finally { setUploading(false) }
  }

  const submit = async () => {
    if (!title.trim() || !content.trim()) { setError('제목과 내용을 입력해주세요'); return }
    setSubmitting(true); setError('')
    try {
      const data: any = { title, content, image_urls: imageUrls }
      if (!user) { data.guest_name = guestName || '익명'; data.guest_password = guestPw || '0000' }
      const res = await posts.create(channel.slug, data)
      onDone(res.data.id)
    } catch (e: any) {
      setError(e.response?.data?.error || '오류가 발생했습니다')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="main">
      <div className="write-form">
        <h2>{channel.name} — 글쓰기</h2>
        {!user && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>닉네임</label>
              <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="익명" />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>비밀번호</label>
              <input type="password" value={guestPw} onChange={e => setGuestPw(e.target.value)} placeholder="0000" />
            </div>
          </div>
        )}
        <div className="form-row">
          <label>제목</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목을 입력하세요" maxLength={200} />
        </div>
        <div className="form-row">
          <label>내용</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="내용을 입력하세요" />
        </div>
        <div className="form-row">
          <label>이미지 첨부</label>
          <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading} />
          {uploading && <span style={{ fontSize: 12, color: '#888' }}>업로드 중...</span>}
          {imageUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {imageUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                  <button onClick={() => setImageUrls(prev => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-actions">
          <button onClick={onCancel}>취소</button>
          <button className="btn btn-pink" onClick={submit} disabled={submitting || uploading}>
            {submitting ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Create Channel Modal
function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ch: Channel) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim() || !slug.trim()) { setError('이름과 슬러그를 입력해주세요'); return }
    try {
      const res = await channels.create({ name, slug: slug.toLowerCase().replace(/\s+/g, '-'), description: desc })
      onCreated(res.data as Channel)
    } catch (e: any) {
      setError(e.response?.data?.error || '채널 생성 실패')
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>새 채널 만들기</h2>
        <div className="form-row">
          <label>채널 이름</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 게임게시판" />
        </div>
        <div className="form-row">
          <label>슬러그 (영문)</label>
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="예: game" />
        </div>
        <div className="form-row">
          <label>설명</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="채널 설명 (선택)" />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button className="btn btn-pink" onClick={submit}>생성</button>
        </div>
      </div>
    </div>
  )
}

// Main App
type Page = { view: 'list' } | { view: 'post'; id: number } | { view: 'write' }

export default function App() {
  const [channelList, setChannelList] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [page, setPage] = useState<Page>({ view: 'list' })
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)

  useEffect(() => {
    channels.list().then(res => {
      setChannelList(res.data)
      if (res.data.length > 0) setActiveChannel(res.data[0])
    })
    const token = localStorage.getItem('token')
    if (token) {
      auth.me().then(res => setUser(res.data)).catch(() => localStorage.removeItem('token'))
    }
  }, [])

  const logout = () => { localStorage.removeItem('token'); setUser(null) }

  const selectChannel = (ch: Channel) => { setActiveChannel(ch); setPage({ view: 'list' }) }

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo" onClick={() => setPage({ view: 'list' })}>
          아카라이브
        </div>
        <div className="header-spacer" />
        <div className="header-auth">
          {user ? (
            <>
              <span className="username">{user.username}</span>
              <button className="btn btn-sm" onClick={logout}>로그아웃</button>
            </>
          ) : (
            <button className="btn btn-pink btn-sm" onClick={() => setShowAuth(true)}>로그인</button>
          )}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-box">
            <div className="sidebar-title">갤러리 목록</div>
            {channelList.map(ch => (
              <span key={ch.id} className={`sidebar-item${activeChannel?.id === ch.id ? ' active' : ''}`}
                onClick={() => selectChannel(ch)}>
                {ch.name}
              </span>
            ))}
            {user && (
              <button className="btn btn-sm" style={{ marginTop: 8, width: '100%' }}
                onClick={() => setShowCreateChannel(true)}>
                + 채널 만들기
              </button>
            )}
          </div>
        </aside>

        {activeChannel ? (
          page.view === 'list' ? (
            <PostList channel={activeChannel} user={user} onPost={id => setPage(id ? { view: 'post', id } : { view: 'write' })} />
          ) : page.view === 'post' ? (
            <PostView postId={page.id} user={user} onBack={() => setPage({ view: 'list' })} />
          ) : (
            <WritePost channel={activeChannel} user={user}
              onDone={id => setPage({ view: 'post', id })}
              onCancel={() => setPage({ view: 'list' })} />
          )
        ) : (
          <div className="main"><div className="loading">불러오는 중...</div></div>
        )}
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onLogin={(u, _t) => { setUser(u); setShowAuth(false) }}
        />
      )}
      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreated={ch => {
            setChannelList(prev => [...prev, ch])
            setActiveChannel(ch)
            setShowCreateChannel(false)
          }}
        />
      )}
    </div>
  )
}
