# GallForum - 커뮤니티 게시판 플랫폼

🌐 **Live Demo:** https://gallforum.lazzy.chat

AI 코딩 툴(Claude Code)을 활용해 개발한 1인 풀스택 프로젝트입니다.

---

## PRD (Product Requirements Document)

### 개요
GallForum은 채널 기반 커뮤니티 게시판 플랫폼으로, 사용자가 채널을 만들고 게시글을 작성하며 댓글과 투표로 소통할 수 있는 서비스입니다.

### 타겟 유저
- 관심사별 커뮤니티를 원하는 사용자
- 주제별 채널에서 정보를 공유하고 싶은 유저

### 주요 기능
| 기능 | 설명 |
|------|------|
| 회원가입 / 로그인 | JWT 기반 인증 |
| 채널 관리 | 채널 목록 조회, 채널 생성 |
| 게시글 | 채널별 게시글 작성 / 조회 / 투표(추천) |
| 댓글 | 게시글 댓글 작성 및 조회 |
| 이미지 업로드 | 게시글 이미지 첨부 |
| 블록 에디터 | 텍스트, 이미지, 유튜브 임베드, 인용구, 스포일러 블록 지원 |

### 기술 스택
- **Frontend:** React 19, TypeScript, Vite, React Router v7, Axios
- **Backend:** Go, Gin framework, SQLite
- **Auth:** JWT
- **Deploy:** nginx reverse proxy, HTTPS

### 개발 방식
AI 코딩 툴(Claude Code)을 활용하여 요구사항 정의부터 배포까지 1인 개발

---

## 실행 방법

```bash
# 백엔드 빌드 및 실행
go build -o gallforum-server ./cmd/...
./gallforum-server

# 프론트엔드
cd frontend
npm install
npm run dev
```
