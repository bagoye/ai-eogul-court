import { createApp } from './app.js';
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
createApp().listen(port, host, () =>
  console.log(
    `AI 억울법정 API: http://${host}:${port} (${process.env.AI_MODE === 'mock' ? '개발용 목업' : 'Gemini'})`,
  ),
);
