package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"arcalive/internal/model"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type PostHandler struct{ db *sql.DB }

func NewPostHandler(db *sql.DB) *PostHandler { return &PostHandler{db} }

func (h *PostHandler) List(c *gin.Context) {
	slug := c.Param("slug")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * 20

	var total int
	h.db.QueryRow(`SELECT COUNT(*) FROM posts p JOIN channels ch ON ch.id=p.channel_id WHERE ch.slug=?`, slug).Scan(&total)

	rows, err := h.db.Query(`
		SELECT p.id, p.channel_id, ch.slug, p.user_id, COALESCE(u.username,''), COALESCE(p.guest_name,''),
			p.title, p.content, p.image_urls, p.likes, p.dislikes, p.comment_count, p.created_at, p.updated_at
		FROM posts p
		JOIN channels ch ON ch.id = p.channel_id
		LEFT JOIN users u ON u.id = p.user_id
		WHERE ch.slug = ?
		ORDER BY p.created_at DESC
		LIMIT 20 OFFSET ?`, slug, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	posts := scanPosts(rows)
	c.JSON(http.StatusOK, gin.H{"posts": posts, "total": total, "page": page})
}

func (h *PostHandler) Get(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	row := h.db.QueryRow(`
		SELECT p.id, p.channel_id, ch.slug, p.user_id, COALESCE(u.username,''), COALESCE(p.guest_name,''),
			p.title, p.content, p.image_urls, p.likes, p.dislikes, p.comment_count, p.created_at, p.updated_at
		FROM posts p
		JOIN channels ch ON ch.id = p.channel_id
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.id = ?`, id)
	var p model.Post
	var imgJSON string
	err := row.Scan(&p.ID, &p.ChannelID, &p.ChannelSlug, &p.UserID, &p.Username, &p.GuestName,
		&p.Title, &p.Content, &imgJSON, &p.Likes, &p.Dislikes, &p.CommentCount, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "게시글을 찾을 수 없습니다"})
		return
	}
	json.Unmarshal([]byte(imgJSON), &p.ImageURLs)
	if p.ImageURLs == nil {
		p.ImageURLs = []string{}
	}
	c.JSON(http.StatusOK, p)
}

func (h *PostHandler) Create(c *gin.Context) {
	slug := c.Param("slug")
	var chID int64
	if err := h.db.QueryRow(`SELECT id FROM channels WHERE slug=?`, slug).Scan(&chID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "채널 없음"})
		return
	}

	var req struct {
		Title         string   `json:"title" binding:"required,min=1,max=200"`
		Content       string   `json:"content" binding:"required"`
		GuestName     string   `json:"guest_name"`
		GuestPassword string   `json:"guest_password"`
		ImageURLs     []string `json:"image_urls"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, loggedIn := c.Get("user_id")

	if !loggedIn && (req.GuestName == "" || req.GuestPassword == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "비회원은 닉네임과 비밀번호를 입력하세요"})
		return
	}

	imgJSON, _ := json.Marshal(req.ImageURLs)

	var uid interface{}
	var guestHash string
	if loggedIn {
		uid = userID
	} else {
		hash, _ := bcrypt.GenerateFromPassword([]byte(req.GuestPassword), 10)
		guestHash = string(hash)
	}

	var id int64
	h.db.QueryRow(
		`INSERT INTO posts (channel_id, user_id, guest_name, guest_password, title, content, image_urls)
		 VALUES (?,?,?,?,?,?,?) RETURNING id`,
		chID, uid, req.GuestName, guestHash, req.Title, req.Content, string(imgJSON),
	).Scan(&id)

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *PostHandler) Vote(c *gin.Context) {
	postID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var req struct {
		Vote int `json:"vote" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (req.Vote != 1 && req.Vote != -1) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vote must be 1 or -1"})
		return
	}

	userID, loggedIn := c.Get("user_id")
	ip := c.ClientIP()

	var alreadyVoted int
	if loggedIn {
		h.db.QueryRow(`SELECT COUNT(*) FROM post_votes WHERE post_id=? AND user_id=?`, postID, userID).Scan(&alreadyVoted)
		if alreadyVoted == 0 {
			if _, err := h.db.Exec(`INSERT INTO post_votes (post_id, user_id, guest_ip, vote) VALUES (?,?,NULL,?)`, postID, userID, req.Vote); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
	} else {
		h.db.QueryRow(`SELECT COUNT(*) FROM post_votes WHERE post_id=? AND guest_ip=? AND user_id IS NULL`, postID, ip).Scan(&alreadyVoted)
		if alreadyVoted == 0 {
			if _, err := h.db.Exec(`INSERT INTO post_votes (post_id, user_id, guest_ip, vote) VALUES (?,NULL,?,?)`, postID, ip, req.Vote); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
	}

	h.db.Exec(`UPDATE posts SET likes=(SELECT COUNT(*) FROM post_votes WHERE post_id=? AND vote=1),
		dislikes=(SELECT COUNT(*) FROM post_votes WHERE post_id=? AND vote=-1) WHERE id=?`,
		postID, postID, postID)

	var likes, dislikes int
	h.db.QueryRow(`SELECT likes, dislikes FROM posts WHERE id=?`, postID).Scan(&likes, &dislikes)
	c.JSON(http.StatusOK, gin.H{"likes": likes, "dislikes": dislikes})
}

func scanPosts(rows *sql.Rows) []model.Post {
	var posts []model.Post
	for rows.Next() {
		var p model.Post
		var imgJSON string
		rows.Scan(&p.ID, &p.ChannelID, &p.ChannelSlug, &p.UserID, &p.Username, &p.GuestName,
			&p.Title, &p.Content, &imgJSON, &p.Likes, &p.Dislikes, &p.CommentCount, &p.CreatedAt, &p.UpdatedAt)
		json.Unmarshal([]byte(imgJSON), &p.ImageURLs)
		if p.ImageURLs == nil {
			p.ImageURLs = []string{}
		}
		posts = append(posts, p)
	}
	if posts == nil {
		posts = []model.Post{}
	}
	return posts
}
