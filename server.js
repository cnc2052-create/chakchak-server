require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ────────────────────────────────────────────
// 클라이언트 초기화
// ────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const INSTAGRAM_TOKEN = process.env.INSTAGRAM_PAGE_TOKEN;
const VERIFY_TOKEN    = process.env.WEBHOOK_VERIFY_TOKEN;
const SHOP_NAME       = process.env.SHOP_NAME || '미소 헤어숍';
const OWNER_PHONE     = process.env.OWNER_PHONE || '';

// ────────────────────────────────────────────
// Claude 시스템 프롬프트
// ────────────────────────────────────────────
const SYSTEM_PROMPT = `
당신은 ${SHOP_NAME}의 AI 예약 비서 "착착이"입니다.
인스타그램 DM으로 들어오는 고객 메시지에 친절하고 자연스럽게 응답하세요.

[예약 진행 순서 - 반드시 이 순서대로]
1. 웰컴 & 시술 종류 확인
2. 사전 안전 체크 (3개월 내 블랙 염색 이력 / 두피 알레르기 / 최근 화학 시술)
3. 분위기 선호도 파악 (조용히 쉬고 싶음 / 대화 원함 / 전문 팁 원함)
4. 촬영 동의 제안 → "시술 후 사진을 저희 인스타에 올려도 될까요? 동의하시면 5,000원 즉시 할인해드려요! 📸"
5. 예약 가능 시간 안내 및 확정
6. 예약 최종 확정 메시지 전송

[규칙]
- 한 번에 하나씩만 질문하세요. 여러 질문을 한꺼번에 하지 마세요.
- 짧고 친근하게 답하세요. 이모지를 적절히 사용하세요.
- 예약이 최종 확정되면 반드시 아래 JSON을 메시지 맨 끝에 포함하세요:
  %%BOOKING%%{"name":"고객명","service":"시술명","time":"예약시간","photo_agree":true/false,"vibe":"quiet/chat/pro","history":"특이사항"}%%END%%
- 가격 문의 시: 커트 35,000원 / 염색 80,000원~ / 펌 90,000원~ / 레이어드펌 120,000원 안내
- 예약 가능 시간: 평일 10:00~19:00, 주말 10:00~17:00 (1시간 단위)
`.trim();

// ────────────────────────────────────────────
// 대화 히스토리 (Supabase)
// ────────────────────────────────────────────
async function getHistory(senderId) {
  const { data } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('sender_id', senderId)
    .order('created_at', { ascending: true })
    .limit(20);
  return data || [];
}

async function saveMessage(senderId, role, content) {
  await supabase.from('conversations').insert({ sender_id: senderId, role, content });
}

async function saveBooking(senderId, bookingData) {
  await supabase.from('bookings').insert({
    sender_id: senderId,
    customer_name: bookingData.name,
    service: bookingData.service,
    booking_time: bookingData.time,
    photo_agree: bookingData.photo_agree,
    vibe: bookingData.vibe,
    special_note: bookingData.history,
    status: 'confirmed',
    discount_applied: bookingData.photo_agree ? 5000 : 0
  });
}

// ────────────────────────────────────────────
// Claude API 호출
// ────────────────────────────────────────────
async function askAI(senderId, userMessage) {
  const history = await getHistory(senderId);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage }
    ]
  });

  return response.choices[0].message.content;
}

// ────────────────────────────────────────────
// 예약 확정 파싱 및 저장
// ────────────────────────────────────────────
async function handleBookingConfirm(senderId, replyText) {
  const match = replyText.match(/%%BOOKING%%([\s\S]*?)%%END%%/);
  if (!match) return replyText;

  try {
    const bookingData = JSON.parse(match[1]);
    await saveBooking(senderId, bookingData);
    await notifyOwner(bookingData);

    // JSON 태그 제거한 깨끗한 메시지만 전송
    return replyText.replace(/%%BOOKING%%[\s\S]*?%%END%%/, '').trim();
  } catch (e) {
    console.error('예약 파싱 오류:', e);
    return replyText.replace(/%%BOOKING%%[\s\S]*?%%END%%/, '').trim();
  }
}

// ────────────────────────────────────────────
// 사장님 알림 (카카오 알림톡 or 문자)
// ────────────────────────────────────────────
async function notifyOwner(booking) {
  // 카카오 알림톡 API 연동 시 여기에 추가
  // 지금은 콘솔 + 슬랙 웹훅으로 대체
  const message = `
🔔 착착 새 예약 알림!
👤 고객: ${booking.name}
💇 시술: ${booking.service}
📅 시간: ${booking.time}
📸 촬영동의: ${booking.photo_agree ? '✅ 예 (-5,000원 할인)' : '❌ 아니요'}
🎨 선호 분위기: ${booking.vibe === 'quiet' ? '🤫 조용히 쉬고 싶음' : booking.vibe === 'chat' ? '💬 대화 선호' : '🎓 전문 팁 선호'}
📝 특이사항: ${booking.history || '없음'}
  `.trim();

  console.log('\n' + '='.repeat(40));
  console.log(message);
  console.log('='.repeat(40) + '\n');

  // 슬랙 웹훅 (SLACK_WEBHOOK_URL 설정 시 활성화)
  if (process.env.SLACK_WEBHOOK_URL) {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text: message }).catch(console.error);
  }
}

// ────────────────────────────────────────────
// 인스타그램 DM 전송
// ────────────────────────────────────────────
async function sendInstagramDM(recipientId, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages`,
    {
      recipient: { id: recipientId },
      message: { text }
    },
    {
      params: { access_token: INSTAGRAM_TOKEN }
    }
  );
}

// ────────────────────────────────────────────
// Meta Webhook 검증 (최초 1회)
// ────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook 검증 성공');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ────────────────────────────────────────────
// Meta Webhook 메시지 수신
// ────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Meta에 빠르게 응답 (타임아웃 방지)

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry) {
      for (const event of entry.messaging || []) {
        // 메시지가 없거나 에코(내가 보낸 것)면 스킵
        if (!event.message || event.message.is_echo) continue;

        const senderId   = event.sender.id;
        const userMessage = event.message.text;

        if (!userMessage) continue;

        console.log(`📩 수신 [${senderId}]: ${userMessage}`);

        // AI 응답 생성
        let replyText = await askAI(senderId, userMessage);

        // 예약 확정 처리
        replyText = await handleBookingConfirm(senderId, replyText);

        // 대화 히스토리 저장
        await saveMessage(senderId, 'user', userMessage);
        await saveMessage(senderId, 'assistant', replyText);

        // 인스타 DM 전송
        await sendInstagramDM(senderId, replyText);

        console.log(`📤 전송 [${senderId}]: ${replyText.substring(0, 80)}...`);
      }
    }
  } catch (err) {
    console.error('❌ Webhook 처리 오류:', err.message);
  }
});

// ────────────────────────────────────────────
// 사장님 대시보드 API
// ────────────────────────────────────────────

// 오늘 예약 목록
app.get('/api/bookings/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .gte('created_at', today)
    .order('booking_time', { ascending: true });

  if (error) return res.status(500).json({ error });
  res.json(data);
});

// 통계
app.get('/api/stats', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const { count: todayBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today);

  const { count: photoAgree } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('photo_agree', true)
    .gte('created_at', today);

  res.json({
    today_bookings: todayBookings || 0,
    photo_agree_count: photoAgree || 0,
    photo_agree_rate: todayBookings ? Math.round((photoAgree / todayBookings) * 100) : 0
  });
});

// 헬스체크
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: '착착 ChakChak Server', version: '1.0.0' });
});

// ────────────────────────────────────────────
// 서버 시작
// ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Railway 필수 - 모든 인터페이스에서 수신
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 착착 서버 실행 중 → http://${HOST}:${PORT}`);
  console.log(`📌 Webhook URL: https://<your-railway-domain>/webhook\n`);
});
