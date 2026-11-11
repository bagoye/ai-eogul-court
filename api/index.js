// Vercel Function entry. vercel.json rewrites every /api/* request here; Express routes by the
// original URL. The CDN serves client/dist, so the app skips static files.
import { createApp } from '../server/dist/server/src/app.js';

export default createApp({ production: true, serveClient: false });
