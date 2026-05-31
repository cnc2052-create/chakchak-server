# 착착(ChakChak) 백엔드 서버

인스타그램 DM → Claude AI 자동응답 → 예약 확정 → 사장님 알림

---

## 배포까지 5단계

### 1. Supabase 세팅 (무료)
1. https://supabase.com 회원가입
2. 새 프로젝트 생성
3. SQL Editor → `supabase_setup.sql` 내용 붙여넣고 실행
4. Settings → API 에서 URL, anon key 복사

### 2. Anthropic API 키 발급
1. https://console.anthropic.com 로그인
2. API Keys → Create Key
3. 키 복사해두기

### 3. Meta 앱 등록
1. https://developers.facebook.com → 앱 만들기
2. Instagram → Instagram Graph API 추가
3. Webhooks 설정: URL = `https://your-server.railway.app/webhook`
4. Verify Token = `.env`의 `WEBHOOK_VERIFY_TOKEN` 값과 동일하게
5. 구독 항목: `messages` 체크

### 4. Railway 배포 (무료 시작)
1. https://railway.app 회원가입
2. New Project → Deploy from GitHub
3. 이 폴더를 GitHub에 올린 뒤 연결
4. Variables 탭에서 `.env.example` 값들 입력
5. 배포 완료 → 도메인 자동 생성

### 5. 테스트
- 인스타 DM에서 "예약하고 싶어요" 전송
- Claude가 자동으로 예약 흐름 진행
- 예약 확정 시 콘솔(또는 슬랙)에 알림 도착

---

## 파일 구조
```
chakchak-server/
├── server.js          # 메인 서버 (전체 로직)
├── package.json       # 의존성
├── .env.example       # 환경변수 템플릿
├── supabase_setup.sql # DB 테이블 생성 쿼리
└── README.md
```

## API 엔드포인트
| Method | Path | 설명 |
|--------|------|------|
| GET | / | 서버 상태 확인 |
| GET | /webhook | Meta Webhook 검증 |
| POST | /webhook | 인스타 DM 수신 |
| GET | /api/bookings/today | 오늘 예약 목록 |
| GET | /api/stats | 오늘 통계 |
