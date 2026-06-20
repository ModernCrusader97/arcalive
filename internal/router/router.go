package router

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

	"arcalive/internal/handler"
	"arcalive/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func New(db *sql.DB) *gin.Engine {
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))
	r.Static("/uploads", "./uploads")

	// Serve built frontend
	distDir := os.Getenv("STATIC_DIR")
	if distDir == "" {
		distDir = "dist"
	}
	if _, err := os.Stat(distDir); err == nil {
		r.Static("/assets", filepath.Join(distDir, "assets"))
		r.NoRoute(func(c *gin.Context) {
			if len(c.Request.URL.Path) > 4 && c.Request.URL.Path[:4] == "/api" {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}
			c.File(filepath.Join(distDir, "index.html"))
		})
	}

	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	auth := handler.NewAuthHandler(db)
	ch := handler.NewChannelHandler(db)
	post := handler.NewPostHandler(db)
	comment := handler.NewCommentHandler(db)

	api := r.Group("/api", middleware.Auth())

	api.POST("/auth/register", auth.Register)
	api.POST("/auth/login", auth.Login)
	api.GET("/auth/me", middleware.RequireAuth(), auth.Me)

	api.GET("/channels", ch.List)
	api.GET("/channels/:slug", ch.Get)
	api.POST("/channels", middleware.RequireAuth(), ch.Create)

	api.GET("/channels/:slug/posts", post.List)
	api.POST("/channels/:slug/posts", post.Create)
	api.GET("/posts/:id", post.Get)
	api.POST("/posts/:id/vote", post.Vote)

	api.GET("/posts/:id/comments", comment.List)
	api.POST("/posts/:id/comments", comment.Create)

	api.POST("/upload", handler.UploadImage)

	return r
}
