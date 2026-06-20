import { useState, useEffect, useCallback, useRef } from 'react'
import { auth, channels, posts, comments, upload } from './api'
import type { Channel, Post, Comment, User } from './api'
import './App.css'

// ─── Block types ────────────────────────────────────────────────────────────
type TextBlock  = { type: 'text';    content: string }
type ImageBlock = { type: 'image';   url: string; align: 'left'|'center'|'right'; size: 'small'|'medium'|'large' }
type DivBlock   = { type: 'divider' }
type QuoteBlock = { type: 'quote';   content: string }
type YTBlock    = { type: 'youtube'; url: string }
type SpoilerBlock = { type: 'spoiler'; content: string }
export type Block = TextBlock | ImageBlock | DivBlock | QuoteBlock | YTBlock | SpoilerBlock

function formatDate(s: string) {
  const d = new Date(s), now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400 && d.getDate() === now.getDate()) return d.toTimeString().slice(0, 5)
  return `${d.getMonth() + 1}.${d.getDate()}`
}

// ─── Inline text renderer ───────────────────────────────────────────────────
function processLine(text: string, keyOffset = 0): React.ReactNode {
  type Rule = { re: RegExp; render: (m: RegExpMatchArray, k: number) => React.ReactNode }
  const rules: Rule[] = [
    { re: /\[color=(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)\]([\s\S]*?)\[\/color\]/, render: (m, k) => <span key={k} style={{ color: m[1] }}>{processLine(m[2])}</span> },
    { re: /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/, render: (m, k) => <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener">{m[1]}</a> },
    { re: /\*\*([\s\S]*?)\*\*/, render: (m, k) => <strong key={k}>{processLine(m[1])}</strong> },
    { re: /\*([\s\S]*?)\*/, render: (m, k) => <em key={k}>{processLine(m[1])}</em> },
    { re: /__([\s\S]*?)__/, render: (m, k) => <u key={k}>{processLine(m[1])}</u> },
    { re: /~~([\s\S]*?)~~/, render: (m, k) => <s key={k}>{processLine(m[1])}</s> },
  ]
  const nodes: React.ReactNode[] = []
  let rem = text, k = keyOffset
  while (rem.length > 0) {
    let best: { idx: number; end: number; node: React.ReactNode } | null = null
    for (const { re, render } of rules) {
      const m = rem.match(re)
      if (m && m.index !== undefined) {
        const idx = m.index
        if (!best || idx < best.idx) best = { idx, end: idx + m[0].length, node: render(m, k++) }
      }
    }
    if (!best) { nodes.push(rem); break }
    if (best.idx > 0) nodes.push(rem.slice(0, best.idx))
    nodes.push(best.node)
    rem = rem.slice(best.end)
  }
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>
}

function renderText(text: string): React.ReactNode {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i}>{i > 0 && <br />}{processLine(line, i * 100)}</span>
      ))}
    </>
  )
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)
  return m ? m[1] : null
}

function parseBlocks(content: string): Block[] | null {
  try {
    const p = JSON.parse(content)
    if (Array.isArray(p) && p[0]?.type) return p as Block[]
  } catch {}
  return null
}

// ─── Image lightbox ─────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-close" onClick={onClose}>✕</div>
      <img src={src} alt="" onClick={e => e.stopPropagation()} />
    </div>
  )
}

// ─── Block Viewer ────────────────────────────────────────────────────────────
function BlockViewer({ blocks }: { blocks: Block[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

  const sizeStyle = (s: 'small'|'medium'|'large') =>
    ({ small: { maxWidth: 300 }, medium: { maxWidth: 560 }, large: { maxWidth: '100%' } })[s]

  return (
    <div className="block-viewer">
      {blocks.map((b, i) => {
        if (b.type === 'text') return (
          <div key={i} className="bv-text">{renderText(b.content)}</div>
        )
        if (b.type === 'image') {
          const just = { left: 'flex-start', center: 'center', right: 'flex-end' }[b.align]
          return (
            <div key={i} style={{ display: 'flex', justifyContent: just, margin: '8px 0' }}>
              <img src={b.url} alt="" style={{ ...sizeStyle(b.size), cursor: 'zoom-in', maxWidth: '100%' }}
                onClick={() => setLightbox(b.url)} />
            </div>
          )
        }
        if (b.type === 'divider') return <hr key={i} className="bv-divider" />
        if (b.type === 'quote') return (
          <blockquote key={i} className="bv-quote">{renderText(b.content)}</blockquote>
        )
        if (b.type === 'youtube') {
          const vid = youtubeId(b.url)
          if (!vid) return null
          return (
            <div key={i} className="bv-youtube">
              <iframe src={`https://www.youtube.com/embed/${vid}`} allowFullScreen title="YouTube" />
            </div>
          )
        }
        if (b.type === 'spoiler') {
          const open = revealed.has(i)
          return (
            <div key={i} className={`bv-spoiler${open ? ' open' : ''}`}
              onClick={() => setRevealed(p => { const s = new Set(p); open ? s.delete(i) : s.add(i); return s })}>
              {open ? renderText(b.content) : <span>⚠️ 스포일러 — 클릭해서 보기</span>}
            </div>
          )
        }
        return null
      })}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── Block Editor ────────────────────────────────────────────────────────────
function AddBar({ onAdd, onImageAdd, uploading }: {
  onAdd: (type: Block['type']) => void
  onImageAdd: (file: File) => void
  uploading: boolean
}) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="add-bar">
      <button className="add-bar-toggle" onClick={() => setOpen(o => !o)}>+</button>
      {open && (
        <div className="add-bar-menu">
          <button onClick={() => { onAdd('text'); setOpen(false) }}>T 텍스트</button>
          <label className={uploading ? 'disabled' : ''}>
            🖼 이미지
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { onImageAdd(f); setOpen(false); if(fileRef.current) fileRef.current.value='' } }} />
          </label>
          <button onClick={() => { onAdd('divider'); setOpen(false) }}>— 구분선</button>
          <button onClick={() => { onAdd('quote'); setOpen(false) }}>&ldquo; 인용구</button>
          <button onClick={() => { onAdd('youtube'); setOpen(false) }}>▶ 유튜브</button>
          <button onClick={() => { onAdd('spoiler'); setOpen(false) }}>⚠ 스포일러</button>
        </div>
      )}
    </div>
  )
}

function BlockEditor({ blocks, setBlocks, uploading, setUploading, setError }: {
  blocks: Block[]
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>
  uploading: boolean
  setUploading: (v: boolean) => void
  setError: (s: string) => void
}) {
  const taRefs = useRef<{ [i: number]: HTMLTextAreaElement | null }>({})

  const update = (i: number, patch: Partial<Block>) =>
    setBlocks(bs => bs.map((b, j) => j === i ? { ...b, ...patch } as Block : b))

  const move = (i: number, dir: -1 | 1) =>
    setBlocks(bs => { const a = [...bs]; [a[i], a[i + dir]] = [a[i + dir], a[i]]; return a })

  const remove = (i: number) =>
    setBlocks(bs => bs.filter((_, j) => j !== i))

  const insert = (afterIdx: number, block: Block) =>
    setBlocks(bs => [...bs.slice(0, afterIdx + 1), block, ...bs.slice(afterIdx + 1)])

  const addImage = async (afterIdx: number, file: File) => {
    setUploading(true)
    try {
      const url = await upload.image(file)
      insert(afterIdx, { type: 'image', url, align: 'center', size: 'large' })
    } catch { setError('이미지 업로드 실패') }
    finally { setUploading(false) }
  }

  const applyFmt = (i: number, fmt: string) => {
    const ta = taRefs.current[i]
    if (!ta) return
    const { selectionStart: ss, selectionEnd: se } = ta
    const b = blocks[i] as TextBlock | QuoteBlock | SpoilerBlock
    if (!('content' in b)) return
    const sel = b.content.slice(ss, se)
    let wrapped = sel
    if (fmt === 'bold') wrapped = `**${sel}**`
    else if (fmt === 'italic') wrapped = `*${sel}*`
    else if (fmt === 'underline') wrapped = `__${sel}__`
    else if (fmt === 'strike') wrapped = `~~${sel}~~`
    else if (fmt === 'link') {
      const url = window.prompt('URL 입력 (https://...):')
      if (!url) return
      wrapped = `[${sel || 'link'}](${url})`
    } else if (fmt.startsWith('color:')) {
      wrapped = `[color=${fmt.slice(6)}]${sel}[/color]`
    }
    const newContent = b.content.slice(0, ss) + wrapped + b.content.slice(se)
    update(i, { content: newContent } as any)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ss + wrapped.length, ss + wrapped.length) }, 0)
  }

  return (
    <div className="block-editor">
      {blocks.map((b, i) => (
        <div key={i}>
          <div className="be-block">
            <div className="be-controls">
              <button onClick={() => move(i, -1)} disabled={i === 0} title="위로">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="아래로">↓</button>
              <button onClick={() => remove(i)} title="삭제" className="be-del">✕</button>
            </div>
            <div className="be-content">
              {(b.type === 'text' || b.type === 'quote' || b.type === 'spoiler') && (
                <>
                  <div className="fmt-toolbar">
                    <button onMouseDown={e => { e.preventDefault(); applyFmt(i, 'bold') }}><b>B</b></button>
                    <button onMouseDown={e => { e.preventDefault(); applyFmt(i, 'italic') }}><i>I</i></button>
                    <button onMouseDown={e => { e.preventDefault(); applyFmt(i, 'underline') }}><u>U</u></button>
                    <button onMouseDown={e => { e.preventDefault(); applyFmt(i, 'strike') }}><s>S</s></button>
                    <button onMouseDown={e => { e.preventDefault(); applyFmt(i, 'link') }}>🔗</button>
                    <label className="color-btn" title="글자색">
                      A
                      <input type="color" defaultValue="#e84393"
                        onChange={e => applyFmt(i, `color:${e.target.value}`)} />
                    </label>
                  </div>
                  <textarea
                    ref={el => { taRefs.current[i] = el }}
                    className={b.type === 'quote' ? 'be-quote-ta' : b.type === 'spoiler' ? 'be-spoiler-ta' : 'be-text-ta'}
                    value={(b as TextBlock).content}
                    onChange={e => update(i, { content: e.target.value } as any)}
                    placeholder={b.type === 'quote' ? '인용구 내용...' : b.type === 'spoiler' ? '스포일러 내용...' : '내용을 입력하세요...'}
                  />
                </>
              )}
              {b.type === 'image' && (
                <div className="be-image">
                  <img src={b.url} alt="" />
                  <div className="be-image-opts">
                    <label>정렬:</label>
                    <select value={b.align} onChange={e => update(i, { align: e.target.value as any })}>
                      <option value="left">좌</option>
                      <option value="center">중앙</option>
                      <option value="right">우</option>
                    </select>
                    <label>크기:</label>
                    <select value={b.size} onChange={e => update(i, { size: e.target.value as any })}>
                      <option value="small">소 (300px)</option>
                      <option value="medium">중 (560px)</option>
                      <option value="large">대 (전체)</option>
                    </select>
                  </div>
                </div>
              )}
              {b.type === 'divider' && <div className="be-divider-preview">— 구분선 —</div>}
              {b.type === 'youtube' && (
                <div className="be-youtube">
                  <input value={b.url} onChange={e => update(i, { url: e.target.value })}
                    placeholder="YouTube URL (https://youtube.com/watch?v=...)" />
                  {youtubeId(b.url) && (
                    <iframe src={`https://www.youtube.com/embed/${youtubeId(b.url)}`}
                      title="YouTube preview" allowFullScreen />
                  )}
                </div>
              )}
            </div>
          </div>
          <AddBar onAdd={type => insert(i, { type, ...(type === 'text' ? { content: '' } : type === 'quote' ? { content: '' } : type === 'spoiler' ? { content: '' } : type === 'youtube' ? { url: '' } : {}) } as Block)}
            onImageAdd={f => addImage(i, f)} uploading={uploading} />
        </div>
      ))}
      {blocks.length === 0 && (
        <AddBar onAdd={type => setBlocks([{ type, ...(type === 'text' ? { content: '' } : type === 'quote' ? { content: '' } : type === 'spoiler' ? { content: '' } : type === 'youtube' ? { url: '' } : {}) } as Block])}
          onImageAdd={f => addImage(-1, f)} uploading={uploading} />
      )}
    </div>
  )
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────
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
          <button className="btn btn-pink" onClick={submit}>{mode === 'login' ? '로그인' : '가입'}</button>
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

// ─── Post List ────────────────────────────────────────────────────────────────
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

// ─── Post View ────────────────────────────────────────────────────────────────
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
    try { const res = await posts.vote(postId, v); setVotes(res.data) } catch {}
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
  const flatten = (list: Comment[]) => list.forEach(c => { allComments.push(c); if (c.replies?.length) flatten(c.replies) })
  flatten(commentList)

  const blocks = parseBlocks(post.content)

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
          {blocks
            ? <BlockViewer blocks={blocks} />
            : <>
                {post.content}
                {post.image_urls?.map((url, i) => <img key={i} src={url} alt="" />)}
              </>
          }
        </div>
        <div className="post-vote">
          <button className="vote-btn up" onClick={() => vote(1)}>👍 추천 {votes.likes}</button>
          <button className="vote-btn down" onClick={() => vote(-1)}>👎 비추 {votes.dislikes}</button>
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

// ─── Write Post ───────────────────────────────────────────────────────────────
function WritePost({ channel, user, onDone, onCancel }: {
  channel: Channel; user: User | null; onDone: (id: number) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([{ type: 'text', content: '' }])
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!title.trim()) { setError('제목을 입력해주세요'); return }
    const hasContent = blocks.some(b => {
      if (b.type === 'text' || b.type === 'quote' || b.type === 'spoiler') return b.content.trim().length > 0
      return true
    })
    if (!hasContent) { setError('내용을 입력해주세요'); return }
    setSubmitting(true); setError('')
    try {
      const data: any = { title, content: JSON.stringify(blocks), image_urls: [] }
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
          <BlockEditor blocks={blocks} setBlocks={setBlocks} uploading={uploading}
            setUploading={setUploading} setError={setError} />
        </div>
        {uploading && <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>이미지 업로드 중...</div>}
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

// ─── Create Channel Modal ─────────────────────────────────────────────────────
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

// ─── Main App ─────────────────────────────────────────────────────────────────
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
        <div className="header-logo" onClick={() => setPage({ view: 'list' })}>GallForum</div>
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
        <AuthModal onClose={() => setShowAuth(false)}
          onLogin={(u, _t) => { setUser(u); setShowAuth(false) }} />
      )}
      {showCreateChannel && (
        <CreateChannelModal onClose={() => setShowCreateChannel(false)}
          onCreated={ch => {
            setChannelList(prev => [...prev, ch])
            setActiveChannel(ch)
            setShowCreateChannel(false)
          }} />
      )}
    </div>
  )
}
