/**
 * Shared email layout.
 *
 * Templates supply content; this wraps it in the HTML shell. Inline styles only — email clients
 * strip <style> blocks and have no CSS cascade worth relying on. Table-free, single-column, so
 * it degrades sanely everywhere including plain-text-preferring clients.
 */

const BRAND = {
  blue: '#0671E0',
  dark: '#0A0A0B',
  muted: '#6b7280',
  border: '#e5e7eb',
  surface: '#f8fafc',
};

/**
 * @param {Object} content
 * @param {string} content.heading
 * @param {string} content.body        Already-escaped HTML paragraphs
 * @param {{ label: string, url: string }} [content.action]
 * @param {string} [content.footNote]
 */
export function renderHtml({ heading, body, action, footNote }) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.dark};">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;padding:32px;">
      <div style="font-weight:700;font-size:20px;margin-bottom:24px;">
        Evallo<span style="color:${BRAND.blue};">Recruit</span>
      </div>

      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${heading}</h1>

      <div style="font-size:15px;line-height:1.6;color:#374151;">${body}</div>

      ${
        action
          ? `<div style="margin:28px 0;">
               <a href="${action.url}"
                  style="display:inline-block;background:${BRAND.blue};color:#ffffff;text-decoration:none;
                         padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                 ${action.label}
               </a>
             </div>
             <p style="font-size:13px;color:${BRAND.muted};line-height:1.6;word-break:break-all;">
               If the button doesn't work, copy this link into your browser:<br>
               <a href="${action.url}" style="color:${BRAND.blue};">${action.url}</a>
             </p>`
          : ''
      }

      ${
        footNote
          ? `<p style="margin-top:24px;padding-top:20px;border-top:1px solid ${BRAND.border};
                       font-size:13px;color:${BRAND.muted};line-height:1.6;">${footNote}</p>`
          : ''
      }
    </div>

    <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:${BRAND.muted};text-align:center;">
      &copy; ${new Date().getFullYear()} Evallo. All rights reserved.
    </p>
  </body>
</html>`;
}
