/* ==========================================================================
   FutaLiveUI — chat bar (room chat), profile card (Wave / Message / Block / Report), incoming-wave toast.
   Plain DOM, phone-first. No styling dependencies. Safety rules are enforced by the database; this only shows the buttons.
   ========================================================================== */
(function (g) {
  'use strict';
  const css = '#flChat{position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));max-width:430px;z-index:40;font:14px system-ui;color:#fff}#flLog{max-height:26vh;overflow:auto;display:flex;flex-direction:column;gap:3px;margin-bottom:6px;-webkit-mask-image:linear-gradient(transparent,#000 22%)}#flLog div{background:#0b1020b8;padding:4px 9px;border-radius:12px;width:fit-content;max-width:100%;word-break:break-word}#flLog b{color:#f5c542;margin-right:5px}#flLog .me b{color:#8bd0ff}#flIn{display:flex;gap:6px}#flIn input{flex:1;min-width:0;border:0;border-radius:20px;padding:10px 14px;background:#0b1020e0;color:#fff;font-size:16px}#flIn button{border:0;border-radius:20px;padding:0 16px;background:#f5c542;color:#111;font-weight:700}.flCard{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(88vw,340px);background:#10172a;color:#fff;border-radius:18px;padding:16px;z-index:60;font:15px system-ui;box-shadow:0 12px 50px #000b}.flCard h3{margin:0 0 4px}.flCard button{display:block;width:100%;margin-top:8px;padding:12px;border:0;border-radius:12px;background:#243056;color:#fff;font-size:15px}.flCard button.gold{background:#f5c542;color:#111;font-weight:700}.flCard .m{color:#f5c542;min-height:18px;margin-top:6px}.flDm{max-height:30vh;overflow:auto;margin:8px 0}.flDm div{padding:4px 0}.flDm .me{color:#8bd0ff}.flToast{position:fixed;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:#10172a;color:#fff;padding:10px 14px;border-radius:14px;z-index:70;font:14px system-ui;display:flex;gap:8px;align-items:center;box-shadow:0 6px 24px #0008}.flToast button{border:0;border-radius:10px;padding:6px 10px;background:#f5c542;font-weight:700}';
  const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; }, esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function mount(live, me) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const bar = $('<div id="flChat"><div id="flLog"></div><form id="flIn"><input maxlength="240" placeholder="Say something nearby…" autocomplete="off" enterkeyhint="send"><button>Send</button></form></div>'); document.body.appendChild(bar);
    const log = bar.querySelector('#flLog'), inp = bar.querySelector('input'); let msgTimer = 0;
    const line = (m) => { const d = document.createElement('div'); if (m.mine) d.className = 'me'; d.innerHTML = '<b>' + esc(m.username) + '</b>' + esc(m.body); log.appendChild(d); while (log.children.length > 40) log.firstChild.remove(); log.scrollTop = 1e6; };
    live.on('history', (a) => { log.innerHTML = ''; a.forEach(line); }); live.on('chat', line);
    bar.querySelector('form').onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; live.say(t).catch(err => note(err.message)); };
    function note(t) { const d = document.createElement('div'); d.textContent = t; d.style.color = '#f5c542'; log.appendChild(d); log.scrollTop = 1e6; clearTimeout(msgTimer); msgTimer = setTimeout(() => d.remove(), 4000); }
    let card = null; const close = () => { if (card) { card.remove(); card = null; } };
    live.on('waveIn', (w) => { const p = live.profiles.get(w.from_user), name = p ? p.username : 'Someone'; const t = $('<div class="flToast"><span>👋 <b>' + esc(name) + '</b> waved at you</span><button>Wave back</button></div>'); document.body.appendChild(t); t.querySelector('button').onclick = () => { live.answerWave(w.id, true).then(() => note('You can message ' + name + ' now.')).catch(e => note(e.message)); t.remove(); }; setTimeout(() => t.remove(), 12000); });
    live.on('waveUpdate', (w) => { if (w.status === 'accepted') note('Your wave was accepted 🎉'); });
    live.on('dm', (d) => { const p = live.profiles.get(d.sender); note('✉ ' + (p ? p.username : 'DM') + ': ' + d.body); if (card && card.dataset.id === d.sender) addDm(d); });
    function addDm(d) { const box = card && card.querySelector('.flDm'); if (!box) return; const x = document.createElement('div'); if (d.sender === me.id) x.className = 'me'; x.textContent = d.body; box.appendChild(x); box.scrollTop = 1e6; }
    /** Open the card for a peer returned by remotes.pick(). */
    function openCard(peer) {
      close(); const p = peer.profile; card = $('<div class="flCard"><h3>' + esc(p.username) + '</h3><div class="flDm" hidden></div><div class="m"></div><button class="gold" data-w>👋 Wave</button><button data-m>✉ Message</button><button data-b>Block</button><button data-r>Report</button><button data-x>Close</button></div>');
      card.dataset.id = p.id; document.body.appendChild(card); const m = card.querySelector('.m'), dm = card.querySelector('.flDm'), say = (t) => { m.textContent = t; };
      card.querySelector('[data-x]').onclick = close;
      card.querySelector('[data-w]').onclick = () => live.wave(p.id).then(r => say(r.status === 'accepted' ? 'You are connected! Tap Message.' : 'Wave sent. They can reply with a wave.')).catch(e => say(e.message));
      card.querySelector('[data-m]').onclick = () => {
        live.dmHistory(p.id).then(rows => { dm.hidden = false; dm.innerHTML = ''; rows.forEach(r => addDm({ sender: r.sender, body: r.body })); let f = card.querySelector('form'); if (f) return; f = $('<form style="display:flex;gap:6px;margin-top:6px"><input maxlength="240" style="flex:1;min-width:0;border:0;border-radius:12px;padding:10px;background:#243056;color:#fff;font-size:16px" placeholder="Message…"><button class="gold" style="width:auto;margin:0;padding:0 14px">Send</button></form>'); card.insertBefore(f, card.querySelector('[data-w]'));
          f.onsubmit = (e) => { e.preventDefault(); const i = f.querySelector('input'), t = i.value.trim(); if (!t) return; i.value = ''; live.dm(p.id, t).then(() => addDm({ sender: me.id, body: t })).catch(err => say(err.message)); }; }).catch(e => say(e.message));
      };
      card.querySelector('[data-b]').onclick = () => { if (confirm('Block ' + p.username + '? You will no longer see each other’s messages.')) live.block(p.id).then(() => { say('Blocked.'); setTimeout(close, 700); }).catch(e => say(e.message)); };
      card.querySelector('[data-r]').onclick = () => { const why = prompt('Report ' + p.username + ' — harassment, spam, impersonation, inappropriate, underage or other?', 'harassment'); if (why) live.report(p.id, why.trim().toLowerCase(), '').then(() => say('Thanks — our team will look at it.')).catch(e => say('Choose: harassment, spam, impersonation, inappropriate, underage, other')); };
    }
    return { openCard, closeCard: close, note, destroy() { bar.remove(); close(); st.remove(); } };
  }
  g.FutaLiveUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
