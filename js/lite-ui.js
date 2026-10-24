// ============================================================
// lite-ui.js  —  EMERGENCY PANEL (Settings → Emergency & Offline), the standalone "lite" file, and its start-up
// ------------------------------------------------------------
//   • Panel   — local-copy status, Emergency mode switch, "Update local copy", Sync to GitHub (with a review screen),
//               Share over Wi-Fi (QR codes), data-file export / import, Emergency PIN, "Save lite app file".
//   • Lite file — liteBuildStandalone() packs THIS app (html + css + js + fonts + icons + the current league data + team
//               logos) into ONE .html file with no external links. Send it by Telegram / Bluetooth / USB; it opens straight
//               from the phone's file manager (Android Chrome) and works with no internet at all.
//   • Boot    — when the page IS such a file (window.HARFS_LITE) the embedded data is merged into the device's local copy,
//               the login screen is replaced by "who are you?" (optionally behind the admin's Emergency PIN) and the app
//               runs in Emergency mode.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================
const LITE_PIN_KEY = 'harfs_lite_pin';
let liteView = 'home';                 // home | wifi | sync
let liteSyncPlan = null;
let liteWifi = { step:'start', code:'', peerId:null, scanning:false };
let liteLastBuild = null;

const liteEsc = s=>String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const liteAgo = ts=>{ if(!ts) return 'never'; const s = Math.max(0, Math.round((Date.now()-ts)/1000)); return s<60 ? 'just now' : s<3600 ? Math.round(s/60)+' min ago' : s<86400 ? Math.round(s/3600)+' h ago' : Math.round(s/86400)+' d ago'; };
const liteKB = n=>n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB';
const liteToast = (m,k,ms)=>{ try{ showToast(m,k||'info',ms||2600); }catch(e){ console.log(m); } };

// ---------------- sheet ----------------
function openLiteSheet(view){
    haptic([8]); liteView = view || 'home';
    document.getElementById('lite-sheet').classList.add('open'); liteRender();
}
function closeLiteSheet(){ liteScanStop(); liteView = 'home'; const el = document.getElementById('lite-sheet'); if(el) el.classList.remove('open'); }
liteNet.onChange = ()=>{ if(document.getElementById('lite-sheet') && document.getElementById('lite-sheet').classList.contains('open') && liteView === 'wifi') liteRender(); liteBannerUpdate(); };

async function liteRender(){
    const box = document.getElementById('lite-body'); if(!box) return;
    liteApplyChrome();
    await liteSettled();
    if(liteView === 'guide'){ box.innerHTML = liteGuideHtml(); return; }
    if(liteView === 'wifi') return liteRenderWifi(box);
    if(liteView === 'sync') return liteRenderSync(box);
    return liteRenderHome(box);
}
const liteBtn = (label, onclick, icon, cls)=>`<button type="button" class="lite-btn ${cls||''}" onclick="${onclick}">${icon?`<i class="fas ${icon}"></i>`:''}<span>${label}</span></button>`;
const liteBack = ()=>`<button type="button" class="lite-back" onclick="liteView='home';liteRender()"><i class="fas fa-arrow-left"></i> Back</button>`;

async function liteRenderHome(box){
    const em = liteIsEmergency(), dirty = liteDirtyList(), files = Array.from(liteFiles.values());
    const total = files.reduce((n,f)=>n+f.text.length,0), newest = files.reduce((n,f)=>Math.max(n,f.fetchedAt||0),0);
    const online = em ? false : await liteNetOk();
    const state = em ? ['lite-s-em','Emergency mode — working only from this device'] : online ? ['lite-s-on','Online — changes go straight to GitHub'] : ['lite-s-off','No connection to GitHub — working from the local copy'];
    const peers = liteNet.peers.size ? Array.from(liteNet.peers.values()).filter(p=>p.state==='open').length : 0;
    const inLite = !!window.HARFS_LITE;
    box.innerHTML = `
        <div class="lite-card ${state[0]}"><span class="lite-dot"></span><b>${state[1]}</b></div>
        <div class="lite-grid">
            <div class="lite-stat"><b>${files.length}/${LITE_FILES.length}</b><span>files copied</span></div>
            <div class="lite-stat"><b>${total ? liteKB(total) : '—'}</b><span>${newest ? 'copied '+liteAgo(newest) : 'nothing copied yet'}</span></div>
            <div class="lite-stat ${dirty.length?'lite-warn':''}"><b>${dirty.length}</b><span>${dirty.length ? 'files with unsynced edits' : 'all synced'}</span></div>
        </div>
        ${files.length < LITE_FILES.length && !inLite ? `<div class="lite-note">The local copy is filled automatically while you use the app online. Tap <b>Update local copy</b> once to be sure everything is stored.</div>` : ''}
        ${inLite ? '' : `<div class="notif-row"><div class="notif-ico"><i class="fas fa-triangle-exclamation"></i></div><div class="notif-info"><b>Emergency mode</b><span>Use only the data on this device — no waiting for the internet, saves stay here until you sync</span></div><div class="perf-toggle ${em?'on':''}" onclick="liteToggleEmergency(this)"></div></div>`}
        <div class="lite-btns">
            ${inLite ? '' : liteBtn('Update local copy now', 'liteDoPull(this)', 'fa-cloud-arrow-down')}
            ${liteBtn('Share over Wi-Fi' + (peers ? ` · ${peers} connected` : ''), "liteView='wifi';liteRender()", 'fa-wifi')}
            ${liteBtn('Sync to GitHub' + (dirty.length ? ` · ${dirty.length}` : ''), 'liteOpenSync()', 'fa-cloud-arrow-up', dirty.length ? 'lite-primary' : '')}
            ${inLite ? '' : liteBtn('Make the lite app file', 'liteDoBuild(this)', 'fa-file-arrow-down')}
            ${liteBtn('Export edits file', 'liteDoExport()', 'fa-file-export')}
            ${liteBtn('Import edits file', "document.getElementById('lite-import').click()", 'fa-file-import')}
            ${inLite ? '' : liteBtn(localStorage.getItem(LITE_PIN_KEY) ? 'Change Emergency PIN' : 'Set Emergency PIN', 'litePinSet()', 'fa-key')}
        </div>
        <input type="file" id="lite-import" accept=".json,application/json" hidden onchange="liteDoImport(event)">
        <div id="lite-build-out"></div>
        <details class="lite-files"><summary>Stored files</summary>
            ${LITE_FILES.map(p=>{ const f = liteFiles.get(p); return `<div class="lite-file"><i class="fas ${f?(f.dirty?'fa-pen':'fa-circle-check'):'fa-circle-xmark'}"></i><span>${p}</span><em>${f ? (f.dirty ? 'edited here · ' : '')+liteKB(f.text.length)+' · '+liteAgo(f.fetchedAt) : 'not stored'}</em></div>`; }).join('')}
            <div class="lite-hint">Every file is fingerprinted (SHA-256) and the last ${LITE_BACKUPS} versions are kept; a damaged copy is replaced from a backup automatically.</div>
        </details>`;
}
async function liteToggleEmergency(el){
    const on = !el.classList.contains('on'); el.classList.toggle('on', on);
    liteSetEmergency(on); document.documentElement.classList.toggle('lite-mode', on); liteBannerUpdate();
    liteToast(on ? 'Emergency mode on — using the local copy only' : 'Emergency mode off', 'info');
    try{ await liteRefreshApp(); }catch(e){} liteRender();
}
async function liteDoPull(btn){
    btn.disabled = true; const lab = btn.querySelector('span'); const old = lab.textContent;
    try{
        const r = await litePullAll((i,n,p)=>{ lab.textContent = `Copying ${i+1}/${n} · ${p}`; });
        liteToast(`Local copy updated (${r.updated} new, ${r.same} unchanged${r.skipped.length?`, ${r.skipped.length} kept because of unsynced edits`:''})`, 'success', 3200);
    }catch(e){ liteToast(e.message || 'Could not update', 'error', 3200); }
    btn.disabled = false; lab.textContent = old; liteRender();
}

// ============================================================
// GUIDE (the "i" button) — a complete instruction manual in Persian
// ============================================================
function liteGuideHtml(){
    const sec = (title, body, open)=>`<details class="lg-sec"${open?' open':''}><summary>${title}</summary><div class="lg-body">${body}</div></details>`;
    const opt = (name, text)=>`<div class="lg-opt"><b dir="ltr">${name}</b><p>${text}</p></div>`;
    return `<div class="lite-guide" dir="rtl">
    <div class="lg-hero"><i class="fas fa-life-ring"></i><div><b>راهنمای حالت اضطراری و آفلاین</b><span>وقتی اینترنت بین‌الملل قطع است، لیگ را با همین برنامه ادامه بده.</span></div></div>
    <p class="lg-p">این بخش به برنامه اجازه می‌دهد <b>بدون اینترنت</b> کار کند: جدول، برنامهٔ بازی‌ها و آرشیو را از روی نسخه‌ای که روی همین گوشی ذخیره شده نشان بدهد، <b>نتیجهٔ بازی‌ها را ثبت کند</b>، چند گوشی را روی <b>وای‌فای</b> به هم وصل کند و بعد از برگشتن اینترنت همه‌چیز را به <b>GitHub</b> منتقل کند.</p>

    ${sec('🚀 شروع سریع — کارهای قبل از قطعی اینترنت', `
        <ol class="lg-steps">
            <li>برنامه را وقتی اینترنت دارید باز کنید و کمی با آن کار کنید. داده‌ها خودبه‌خود روی گوشی ذخیره می‌شوند.</li>
            <li>در همین پنل دکمهٔ <b dir="ltr">Update local copy now</b> را یک بار بزنید تا عدد «files copied» به <b dir="ltr">7/7</b> برسد.</li>
            <li>ادمین دکمهٔ <b dir="ltr">Make the lite app file</b> را بزند و فایل HTML ساخته‌شده را با تلگرام یا بلوتوث برای بقیه بفرستد.</li>
            <li>(اختیاری) ادمین با <b dir="ltr">Set Emergency PIN</b> یک رمز بگذارد تا فقط خودش بتواند داخل فایل لایت با هویت ادمین وارد شود.</li>
            <li>موقع قطعی: برنامه را باز کنید. اگر اینترنت نبود، خودش از نسخهٔ محلی کار می‌کند؛ برای اطمینان <b dir="ltr">Emergency mode</b> را روشن کنید.</li>
            <li>وقتی اینترنت برگشت: ادمین از همین پنل <b dir="ltr">Sync to GitHub</b> را می‌زند.</li>
        </ol>
        <div class="lg-note">⚠️ <b>مهم:</b> همهٔ این کارها باید <u>قبل از قطعی</u> انجام شود. وقتی اینترنت قطع است، نه می‌شود فایل لایت ساخت و نه نسخهٔ محلی را به‌روز کرد.</div>`, true)}

    ${sec('🧩 توضیح همهٔ گزینه‌های این پنل', `
        ${opt('کارت وضعیت (نقطهٔ رنگی بالا)', 'نشان می‌دهد برنامه الان از کجا کار می‌کند: <b>سبز</b> = آنلاین و تغییرات مستقیم به GitHub می‌رود. <b>زرد</b> = GitHub در دسترس نیست و برنامه از نسخهٔ محلی استفاده می‌کند. <b>نارنجی</b> = حالت اضطراری روشن است و فقط داده‌های همین دستگاه استفاده می‌شود.')}
        ${opt('سه کادر آمار', '«files copied»: چند فایل از ۷ فایل لیگ روی گوشی ذخیره شده. کادر وسط: حجم کل و اینکه آخرین کپی چند وقت پیش بوده. کادر سوم: چند فایل ویرایشی دارید که هنوز به GitHub نرفته (اگر صفر است یعنی همه‌چیز همگام است).')}
        ${opt('Emergency mode', 'کلید روشن/خاموش. وقتی روشن است برنامه به اینترنت دست نمی‌زند و منتظر آن نمی‌ماند؛ همه‌چیز از نسخهٔ محلی خوانده و نتیجه‌ها روی همین گوشی ذخیره می‌شود. یک نوار نارنجی بالای صفحه نشان می‌دهد در این حالت هستید و با لمس آن این پنل باز می‌شود. این کلید فقط در برنامهٔ اصلی هست؛ فایل لایت همیشه در حالت اضطراری است.')}
        ${opt('Update local copy now', 'همهٔ فایل‌های لیگ را همین حالا از GitHub می‌گیرد و روی گوشی ذخیره می‌کند. فایل‌هایی که ویرایش همگام‌نشده دارند دست‌نخورده می‌مانند. جدا از این، وقتی آنلاین هستید برنامه خودش هم هر حدود ۶ ساعت یک بار نسخهٔ محلی را به‌روز می‌کند.')}
        ${opt('Share over Wi-Fi', 'چند گوشی را روی یک وای‌فای (یا هات‌اسپات) بدون اینترنت به هم وصل می‌کند تا نتیجه‌ها و پیام‌های چت بین آن‌ها رد و بدل شود. مراحل کامل در بخش «چند گوشی روی وای‌فای» پایین‌تر آمده.')}
        ${opt('Sync to GitHub', 'ویرایش‌های ثبت‌شده در حالت اضطراری را به GitHub می‌فرستد. اول صفحهٔ بررسی را نشان می‌دهد و بعد از تأیید شما می‌نویسد. عدد کنار دکمه تعداد فایل‌های منتظر انتقال است. فقط با حساب واقعی ادمین و وقتی اینترنت هست کار می‌کند.')}
        ${opt('Make the lite app file', 'کل برنامه + داده‌های فعلی + لوگوی تیم‌ها + فونت‌ها را در <b>یک فایل HTML</b> (حدود ۲ مگابایت) جمع می‌کند که هیچ لینک اینترنتی ندارد. فقط در برنامهٔ اصلی و وقتی نسخهٔ محلی کامل است ساخته می‌شود. بعد از ساخت، دکمهٔ «Share / save» ظاهر می‌شود.')}
        ${opt('Export edits file', 'ویرایش‌های همین گوشی را در یک فایل کوچک <span dir="ltr">.json</span> ذخیره یا ارسال می‌کند تا روی دستگاه دیگری وارد شود.')}
        ${opt('Import edits file', 'یک فایل ویرایش را که از دستگاه دیگری گرفته‌اید وارد می‌کند. داده‌ها با هم <b>ادغام</b> می‌شوند و چیزی پاک نمی‌شود.')}
        ${opt('Set / Change Emergency PIN', 'رمزی که در فایل لایت برای ورود با هویت ادمین (Bayern) پرسیده می‌شود. فقط در برنامهٔ اصلی تنظیم می‌شود و در فایل لایت‌های بعدی که می‌سازید قرار می‌گیرد. خالی گذاشتن آن، رمز را برمی‌دارد.')}
        ${opt('Stored files', 'فهرست ۷ فایل ذخیره‌شده: ✔ یعنی همگام با GitHub، ✎ یعنی در همین دستگاه ویرایش شده و هنوز ارسال نشده، ✖ یعنی هنوز ذخیره نشده. هر فایل اثر انگشت SHA-256 دارد و ۳ نسخهٔ آخرش نگه داشته می‌شود؛ اگر نسخه‌ای خراب شود خودکار از بکاپ برمی‌گردد.')}
        ${opt('دکمهٔ i (همین راهنما)', 'با زدن دوباره روی آن (که فلش برگشت شده) به پنل برمی‌گردید.')}`)}

    ${sec('📱 سناریو ۱ — اینترنت قطع شد و برنامه روی گوشی نصب است', `
        <ol class="lg-steps">
            <li>برنامه را باز کنید. اگر GitHub در دسترس نباشد، خودش از نسخهٔ محلی کار می‌کند (ممکن است ۴ ثانیه طول بکشد تا قطعی را تشخیص دهد).</li>
            <li>برای سرعت و اطمینان بیشتر از <b dir="ltr">Settings ← Emergency &amp; Offline</b> کلید <b dir="ltr">Emergency mode</b> را روشن کنید.</li>
            <li>جدول، برنامه و آرشیو را مثل همیشه ببینید.</li>
            <li>ادمین نتیجهٔ بازی‌ها را مثل همیشه ثبت کند؛ ذخیره روی گوشی انجام می‌شود و پیام «ذخیره شد» می‌آید.</li>
            <li>جدول لیگ همیشه از روی فهرست بازی‌ها دوباره محاسبه می‌شود، پس بعد از ادغام اعداد جدول درست است.</li>
        </ol>`)}

    ${sec('📄 سناریو ۲ — استفاده از فایل لایت (برای کسی که برنامه را ندارد)', `
        <ol class="lg-steps">
            <li>فایل <span dir="ltr">HARFS-Lite-….html</span> را از ادمین بگیرید (تلگرام، بلوتوث، فلش).</li>
            <li>آن را از فایل‌منیجر گوشی <b>با Chrome</b> باز کنید (اندروید). نیازی به اینترنت نیست.</li>
            <li>صفحهٔ «Who is using this device?» می‌آید: تیم خودتان را انتخاب کنید. اگر ادمین PIN گذاشته باشد، برای تیم ادمین (Bayern) رمز را می‌پرسد.</li>
            <li>از اینجا برنامه مثل نسخهٔ معمولی کار می‌کند، با داده‌های تاریخ ساخت فایل. عکس کارت‌ها و تصاویری که از اینترنت می‌آیند ممکن است نمایش داده نشوند.</li>
            <li>این فایل نمی‌تواند وارد حساب شود و مستقیم به GitHub بفرستد. برای انتقال ویرایش‌ها از <b dir="ltr">Export edits file</b> استفاده کنید (سناریو ۴).</li>
        </ol>
        <div class="lg-note">📌 روی آیفون فایل HTML مستقل درست کار نمی‌کند؛ آنجا برنامهٔ نصب‌شده را در حالت <b dir="ltr">Emergency mode</b> استفاده کنید.</div>`)}

    ${sec('📶 سناریو ۳ — چند گوشی روی وای‌فای (بدون اینترنت)', `
        <p class="lg-p">همهٔ گوشی‌ها باید روی <b>یک وای‌فای</b> باشند (یا یکی از گوشی‌ها هات‌اسپات روشن کند و بقیه وصل شوند). اینترنت لازم نیست. یکی از گوشی‌ها <b>میزبان</b> است و بقیه به او وصل می‌شوند.</p>
        <b class="lg-h">میزبان</b>
        <ol class="lg-steps">
            <li>پنل را باز کنید ← <b dir="ltr">Share over Wi-Fi</b> ← <b dir="ltr">I am the host — add a device</b>.</li>
            <li>یک QR نمایش داده می‌شود. اجازه دهید دستگاه دوم آن را اسکن کند.</li>
            <li>دستگاه دوم یک QR پاسخ نشان می‌دهد؛ روی <b dir="ltr">2 · Scan their answer</b> بزنید و آن را اسکن کنید.</li>
            <li>اتصال برقرار می‌شود. برای هر دستگاه جدید دوباره «add a device» بزنید تا کد تازه بسازد.</li>
        </ol>
        <b class="lg-h">دستگاه عضو</b>
        <ol class="lg-steps">
            <li>پنل را باز کنید ← <b dir="ltr">Share over Wi-Fi</b> ← <b dir="ltr">Join a host (scan its code)</b>.</li>
            <li>دوربین را روی QR میزبان بگیرید (اجازهٔ دوربین را بدهید).</li>
            <li>QR پاسخ نمایش داده می‌شود؛ آن را به میزبان نشان بدهید تا اسکن کند.</li>
            <li>وقتی «Connected» دیدید، وصل هستید.</li>
        </ol>
        <b class="lg-h">اگر اسکن QR نشد</b>
        <p class="lg-p">زیر QR گزینهٔ «Can't scan? Copy the code» هست: کد را کپی کنید و در دستگاه مقابل در بخش «Paste … code» بچسبانید (می‌توانید با هر پیام‌رسانی که روی همان شبکه کار می‌کند بفرستید).</p>
        <b class="lg-h">بعد از اتصال چه می‌شود؟</b>
        <ul class="lg-ul">
            <li>نتیجه‌هایی که هر دستگاه ثبت می‌کند به بقیه می‌رسد و با هم <b>ادغام</b> می‌شود؛ اگر دو نفر هم‌زمان دو بازی مختلف ثبت کنند هر دو می‌ماند.</li>
            <li>پیام‌های چت بین همه پخش می‌شود (چت محلی).</li>
            <li>دستگاهی که دیرتر وصل شود همهٔ داده‌ها و تاریخچهٔ چت را می‌گیرد.</li>
            <li>اگر میزبان برنامه را ببندد یا وای‌فای قطع شود، اتصال قطع می‌شود و باید دوباره با QR وصل شوید.</li>
            <li>«Disconnect all» همهٔ اتصال‌ها را می‌بندد.</li>
        </ul>`)}

    ${sec('☁️ سناریو ۴ — اینترنت برگشت: انتقال به GitHub (فقط ادمین)', `
        <b class="lg-h">اگر ویرایش‌ها روی برنامهٔ اصلی خود ادمین است</b>
        <ol class="lg-steps">
            <li>با حساب ادمین وارد برنامه شوید و مطمئن شوید اینترنت وصل است.</li>
            <li>پنل ← <b dir="ltr">Sync to GitHub</b>.</li>
            <li>صفحهٔ «Review before writing to GitHub» را بخوانید: برای هر فایل می‌بینید چه تغییری ثبت شده (+ اضافه، − حذف، ~ تغییر) و فهرست ذخیره‌هایی که در حالت اضطراری انجام شده.</li>
            <li>اگر برچسب «GitHub changed meanwhile → merged» دیدید یعنی کس دیگری هم در این فاصله GitHub را عوض کرده بود و تغییرها با هم ادغام شده‌اند.</li>
            <li>اگر مقداری هم روی GitHub و هم روی گوشی عوض شده باشد، دو گزینه می‌بینید: «Keep my offline edit» (ویرایش اضطراری من بماند — پیش‌فرض) یا «Keep GitHub's value».</li>
            <li><b dir="ltr">Push to GitHub</b> را بزنید. بعد از موفقیت برنامه خودش دوباره بارگذاری می‌شود.</li>
        </ol>
        <b class="lg-h">اگر ویرایش‌ها روی فایل لایت یا گوشی دیگری است</b>
        <ol class="lg-steps">
            <li>روی همان گوشی <b dir="ltr">Export edits file</b> را بزنید و فایل <span dir="ltr">.json</span> را برای ادمین بفرستید.</li>
            <li>ادمین در برنامهٔ اصلی (آنلاین) <b dir="ltr">Import edits file</b> را می‌زند و آن فایل را انتخاب می‌کند.</li>
            <li>بعد همان مراحل بالا: <b dir="ltr">Sync to GitHub</b>.</li>
        </ol>
        <div class="lg-note">ℹ️ تا وقتی ویرایش همگام‌نشده دارید، برنامه حتی با اینترنت هم نسخهٔ محلیِ همان فایل‌ها را نشان می‌دهد؛ بعد از Sync دوباره از GitHub می‌خواند.</div>`)}

    ${sec('💬 چت در حالت اضطراری', `
        <ul class="lg-ul">
            <li>صفحهٔ چت (Overall ← Chat) همان صفحهٔ همیشگی است، ولی «چت محلی» می‌شود؛ بالای صفحه نوشته «Local chat».</li>
            <li>فقط <b>متن</b> (تا ۲۵۰ کاراکتر)، ریپلای، ری‌اکشن و حذف پیام کار می‌کند. فایل، عکس و پیام صوتی نیاز به اینترنت دارد و دکمه‌شان مخفی است.</li>
            <li>پیام‌ها فقط روی دستگاه‌های وصل‌شده می‌ماند و بعد از برگشت اینترنت به چت اصلی منتقل نمی‌شود.</li>
            <li>برای دیدن پیام دیگران باید دستگاه‌ها طبق سناریو ۳ به هم وصل باشند.</li>
        </ul>`)}

    ${sec('🚫 چه چیزهایی بدون اینترنت کار نمی‌کند', `
        <ul class="lg-ul">
            <li>ورود به حساب (لاگین) و اعلان‌ها.</li>
            <li>خرید و بازی کردن کارت‌ها، پاداش Combo.</li>
            <li>مجله، Moments، دستیار هوشمند و موسیقی.</li>
            <li>عکس‌ها و فایل‌های چت اصلی؛ تصاویری که از GitHub می‌آیند (مثل تصویر کارت‌ها یا عکس پروفایل) ممکن است دیده نشوند.</li>
        </ul>
        <p class="lg-p">آنچه کار می‌کند: دیدن جدول/برنامه/آرشیو، <b>ثبت و ویرایش نتیجه و امتیاز</b>، اشتراک با دستگاه‌های دیگر روی وای‌فای و چت محلی.</p>`)}

    ${sec('🔒 امنیت و نگهداری از داده‌ها', `
        <ul class="lg-ul">
            <li>داده‌های لیگ عمومی‌اند (همان فایل‌های GitHub). در فایل لایت هیچ رمز یا توکن حساب‌ها قرار نمی‌گیرد؛ فقط اثر انگشت (هش) PIN اضطراری، نه خود PIN.</li>
            <li><b>PIN اضطراری فقط جلوی ورود به هویت ادمین داخل فایل لایت را می‌گیرد.</b> دسترسی واقعی نوشتن در GitHub را ورکر موقع Sync تعیین می‌کند؛ پس کسی که ویرایش‌های اضطراری را بفرستد، ادمین قبل از نوشتن آن‌ها را در صفحهٔ بررسی می‌بیند.</li>
            <li>برای امن ماندن نسخهٔ محلی، داده‌های مرورگر/برنامه را پاک نکنید و برنامه را حذف نکنید. برنامه از مرورگر می‌خواهد فضا را پاک نکند ولی ضمانتش با خود مرورگر است.</li>
            <li>قبل از هر تغییر و هر به‌روزرسانی نسخهٔ قبلی فایل نگه داشته می‌شود (۳ نسخه).</li>
            <li>یک «فایل ویرایش‌ها» را هم می‌توان به‌عنوان بکاپ نگه داشت.</li>
        </ul>`)}

    ${sec('🛠️ عیب‌یابی', `
        <div class="lg-qa"><b>پیام «No connection to GitHub right now» برای Sync</b><p>اینترنت وصل نیست یا Emergency mode روشن است. آن را خاموش کنید و اینترنت را بررسی کنید.</p></div>
        <div class="lg-qa"><b>پیام «Log in with your real account first»</b><p>با حساب واقعی ادمین در برنامهٔ اصلی وارد شوید (از داخل فایل لایت نمی‌شود).</p></div>
        <div class="lg-qa"><b>پیام «This account is not allowed to write league data»</b><p>حساب شما ادمین نیست. Sync فقط با حساب ادمین کار می‌کند.</p></div>
        <div class="lg-qa"><b>پیام «The local copy is incomplete»</b><p>موقع ساخت فایل لایت: ابتدا با اینترنت <b dir="ltr">Update local copy now</b> را بزنید.</p></div>
        <div class="lg-qa"><b>QR اسکن نمی‌شود</b><p>روشنایی صفحه را زیاد کنید، فاصله را کم/زیاد کنید، یا از کپی کد استفاده کنید. اجازهٔ دوربین را هم بررسی کنید.</p></div>
        <div class="lg-qa"><b>دو گوشی وصل نمی‌شوند</b><p>مطمئن شوید روی یک شبکه‌اند. بعضی وای‌فای‌ها (مثلاً مودم‌های عمومی) دستگاه‌ها را از هم جدا می‌کنند؛ در این صورت یکی هات‌اسپات روشن کند و بقیه به آن وصل شوند. هر دستگاه کد خودش را لازم دارد.</p></div>
        <div class="lg-qa"><b>بعد از وصل شدن اینترنت هنوز داده قدیمی است</b><p>اگر فایل ویرایش‌نشده است، «Update local copy now» را بزنید. اگر ویرایش همگام‌نشده دارید، ابتدا Sync کنید.</p></div>`)}
    <div class="lg-foot">برای بستن راهنما دوباره روی دکمهٔ <b>i</b> (فلش) بالای پنل بزنید.</div>
    </div>`;
}
function liteApplyChrome(){
    const b = document.getElementById('lite-info-btn'), t = document.getElementById('lite-title'), s = document.getElementById('lite-subtitle');
    const g = liteView === 'guide';
    if(b){ b.classList.toggle('on', g); b.innerHTML = g ? '<i class="fas fa-arrow-left"></i>' : '<i class="fas fa-info"></i>'; }
    if(t) t.textContent = g ? 'راهنمای حالت اضطراری' : 'Emergency & Offline';
    if(s) s.textContent = g ? 'دستورالعمل کامل · روی هر عنوان بزنید تا باز شود' : 'Keep working when the internet is cut';
}
function liteToggleGuide(){
    haptic([6]); liteView = liteView === 'guide' ? 'home' : 'guide'; liteRender();
    const sc = document.getElementById('lite-body'); if(sc) sc.scrollTop = 0;
}

// ---------------- sync to GitHub ----------------
async function liteOpenSync(){ liteView = 'sync'; liteSyncPlan = null; liteRender(); }
async function liteRenderSync(box){
    box.innerHTML = liteBack() + '<div class="text-center text-gray-500 text-xs" style="padding:24px;"><span class="spinner"></span></div>';
    let plan;
    try{ plan = await liteSync({ dry:true, prefer:'local' }); }
    catch(e){
        const file = !!window.HARFS_LITE;
        box.innerHTML = liteBack() + `<div class="lite-note lite-bad">${liteEsc(e.message)}</div>` + (file || e.message.includes('real account') ? `<div class="lite-hint">${file ? 'This lite file cannot log in. ' : ''}Use <b>Export edits file</b>, open the normal HARFS app on a device that is online, log in as admin and use <b>Import edits file</b> followed by <b>Sync to GitHub</b>.</div>` : '');
        return;
    }
    liteSyncPlan = plan;
    if(!plan.length){ box.innerHTML = liteBack() + '<div class="lite-note">Nothing to sync — everything on this device is already on GitHub. ✅</div>'; return; }
    const nconf = plan.reduce((n,p)=>n+p.conflicts.length,0);
    box.innerHTML = liteBack() + `<div class="lite-title">Review before writing to GitHub</div>` +
        plan.map(p=>`<div class="lite-plan"><div><i class="fas fa-file-code"></i> <b>${p.path}</b></div>
            <div class="lite-sum">${liteSummaryText(p.summary)} ${p.remoteChanged ? '<span class="lite-tag">GitHub changed meanwhile → merged</span>' : ''}</div>
            ${p.conflicts.length ? `<details><summary class="lite-warn-t">${p.conflicts.length} value(s) edited on both sides</summary>${p.conflicts.slice(0,12).map(c=>`<div class="lite-conf">${liteEsc(c.path)}<br><em>mine:</em> ${liteEsc(JSON.stringify(c.local)||'—').slice(0,60)} · <em>GitHub:</em> ${liteEsc(JSON.stringify(c.remote)||'—').slice(0,60)}</div>`).join('')}</details>` : ''}</div>`).join('') +
        `<div class="lite-journal"><b>Saved while offline</b>${liteJournal.slice(-12).map(j=>`<div>${new Date(j.ts).toLocaleString()} · ${liteEsc(j.by||'?')} · ${liteEsc(j.msg||j.path)}</div>`).join('')}</div>` +
        (nconf ? `<label class="lite-pref"><input type="radio" name="lite-prefer" value="local" checked> Keep my offline edit when both changed</label><label class="lite-pref"><input type="radio" name="lite-prefer" value="remote"> Keep GitHub's value when both changed</label>` : '') +
        `<div class="lite-btns">${liteBtn('Push to GitHub', 'liteDoSync(this)', 'fa-cloud-arrow-up', 'lite-primary')}</div>`;
}
async function liteDoSync(btn){
    btn.disabled = true; const prefer = (document.querySelector('input[name="lite-prefer"]:checked') || {}).value || 'local';
    try{
        const done = await liteSync({ prefer });
        liteToast(`Synced ${done.length} file(s) to GitHub ✅ — reloading`, 'success', 2600);
        setTimeout(()=>location.reload(), 1200);              // the app's cached file versions are stale now
    }catch(e){ liteToast(e.message || 'Sync failed', 'error', 4200); btn.disabled = false; }
}

// ---------------- edits file ----------------
async function liteDoExport(){
    const pkg = await liteExportPackage({ chat:false });
    const name = `harfs-edits-${liteDev}-${new Date().toISOString().slice(0,10)}.json`;
    liteDeliver(new Blob([JSON.stringify(pkg)], { type:'application/json' }), name);
}
async function liteDoImport(ev){
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if(!f) return;
    try{
        const r = await liteImportPackage(JSON.parse(await f.text()));
        liteToast(r.changed.length ? `Imported — ${r.changed.length} file(s) updated${r.conflicts?`, ${r.conflicts} value(s) edited on both sides`:''}` : 'Imported — nothing new in that file', 'success', 3600);
        try{ await liteRefreshApp(); }catch(e){} liteBannerUpdate(); liteRender();
    }catch(e){ liteToast(e.message || 'Could not read that file', 'error', 3600); }
}
async function liteDeliver(blob, name){
    try{ const file = new File([blob], name, { type:blob.type }); if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:name }); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 20000);
}

// ---------------- emergency PIN ----------------
async function litePinHash(pin, salt){
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:new TextEncoder().encode(salt), iterations:100000 }, key, 256);
    return Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function litePinSet(){
    const pin = prompt('Emergency PIN for the lite file (needed to sign in as the admin account there). Leave empty to remove it.');
    if(pin === null) return;
    if(!pin){ localStorage.removeItem(LITE_PIN_KEY); liteToast('Emergency PIN removed', 'info'); return liteRender(); }
    const salt = liteRand(8); localStorage.setItem(LITE_PIN_KEY, JSON.stringify({ salt, hash:await litePinHash(pin, salt) }));
    liteToast('Emergency PIN saved — it is built into the next lite file you make', 'success', 3200); liteRender();
}

// ============================================================
// THE STANDALONE FILE
// ============================================================
async function liteBuildStandalone(onStep){
    const step = t=>{ try{ onStep && onStep(t); }catch(e){} };
    const get = async rel=>{ const r = await fetch(rel); if(!r.ok) throw new Error('Could not read '+rel+' (open the app online once, then try again)'); return r.text(); };
    await liteSettled();
    if(liteFiles.size < LITE_FILES.length - 1) throw new Error('The local copy is incomplete — tap "Update local copy now" first');
    step('Reading the app…');
    const doc = new DOMParser().parseFromString(await get('index.html'), 'text/html');
    // styles: local ones inlined, the two CDN sheets replaced by the offline vendor CSS
    const vendor = await get('css/lite-vendor.css');
    const head = doc.head;
    head.querySelectorAll('noscript, link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="preconnect"]').forEach(n=>n.remove());
    const vs = doc.createElement('style'); vs.textContent = vendor; head.insertBefore(vs, head.firstChild);
    for(const l of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))){
        const href = l.getAttribute('href') || '';
        if(/^https?:/.test(href) || /(^|\/)lite-vendor\.css$/.test(href)){ l.remove(); continue; }   // the vendor CSS is already inlined above
        const st = doc.createElement('style'); st.textContent = await get(href); l.replaceWith(st);
    }
    step('Reading the code…');
    for(const s of Array.from(doc.querySelectorAll('script'))){
        const src = s.getAttribute('src');
        if(!src){ if(/serviceWorker/.test(s.textContent)) s.remove(); continue; }
        if(/^https?:/.test(src)){ s.remove(); continue; }
        let code = await get(src);
        if(/appearance\.js$/.test(src)) code = code.split("url('fonts/${f.file}')").join("url('${(window.HARFS_LITE_FONTS && window.HARFS_LITE_FONTS.files[f.file]) || 'fonts/'+f.file}')");
        s.removeAttribute('src'); s.textContent = code.replace(/<\/script/gi, '<\\/script');
    }
    step('Packing the data…');
    const pkg = await liteExportPackage({ chat:false });
    Object.keys(pkg.base).forEach(p=>{ if(!pkg.files[p] || !pkg.files[p].dirty) delete pkg.base[p]; });     // a clean file's base is itself
    pkg.logos = {};
    try{ for(const t of (typeof TEAM_NAMES !== 'undefined' ? TEAM_NAMES : [])){ const rec = await idbGet('teamLogos', t); if(rec && rec.dataUrl) pkg.logos[t] = rec.dataUrl; } }catch(e){}
    const pinRaw = localStorage.getItem(LITE_PIN_KEY); if(pinRaw){ try{ pkg.pin = JSON.parse(pinRaw); }catch(e){} }
    step('Packing the fonts…');
    const fonts = { manifest:[], files:{} };
    try{
        const manifest = JSON.parse(await get('fonts/manifest.json')); fonts.manifest = manifest;
        for(const m of manifest){ const buf = new Uint8Array(await (await fetch('fonts/'+m.file)).arrayBuffer()); let bin = ''; for(let i=0;i<buf.length;i+=0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i+0x8000));
            fonts.files[m.file] = `data:font/${m.format==='woff2'?'woff2':m.format==='otf'?'otf':'ttf'};base64,${btoa(bin)}`; }
    }catch(e){ /* fonts are optional */ }
    let jsqr = ''; try{ jsqr = await get('js/vendor/jsqr.min.js'); }catch(e){}
    const esc = o=>JSON.stringify(o).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const boot = doc.createElement('script');
    boot.textContent = `window.HARFS_LITE=true;window.HARFS_LITE_PKG=${esc(pkg)};window.HARFS_LITE_FONTS=${esc(fonts)};window.HARFS_LITE_BUILT=${Date.now()};`;
    head.appendChild(boot);
    const blobScript = doc.createElement('script'); blobScript.type = 'text/plain'; blobScript.id = 'lite-jsqr'; blobScript.textContent = jsqr.replace(/<\/script/gi, '<\\/script'); doc.body.appendChild(blobScript);
    if(!doc.title) { const t = doc.createElement('title'); t.textContent = 'HARFS Lite'; head.appendChild(t); }
    const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    return new Blob([html], { type:'text/html' });
}
async function liteDoBuild(btn){
    btn.disabled = true; const lab = btn.querySelector('span'), old = lab.textContent, out = document.getElementById('lite-build-out');
    try{
        const blob = await liteBuildStandalone(t=>{ lab.textContent = t; });
        const name = `HARFS-Lite-${new Date().toISOString().slice(0,10)}.html`; liteLastBuild = { blob, name };
        out.innerHTML = `<div class="lite-note lite-ok"><b>${name}</b> · ${liteKB(blob.size)} — contains the league data from ${liteAgo(Array.from(liteFiles.values()).reduce((n,f)=>Math.max(n,f.fetchedAt||0),0))}.<div class="lite-btns">${liteBtn('Share / save', 'liteDeliver(liteLastBuild.blob, liteLastBuild.name)', 'fa-share-nodes', 'lite-primary')}</div>
            <div class="lite-hint">Send it with Telegram / Bluetooth, then open it from the file manager in Chrome. On iPhone use the app itself in Emergency mode instead.</div></div>`;
    }catch(e){ liteToast(e.message || 'Could not build the file', 'error', 4200); }
    btn.disabled = false; lab.textContent = old;
}

// ============================================================
// WI-FI SHARING SCREENS
// ============================================================
function liteDrawQr(canvas, text){
    const q = qrcode(0, 'L'); q.addData(text, 'Byte'); q.make();
    const n = q.getModuleCount(), quiet = 4, cell = Math.max(2, Math.floor(Math.min(canvas.parentNode.clientWidth || 320, 340) / (n + quiet*2)));
    const size = (n + quiet*2) * cell; canvas.width = canvas.height = size;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.fillStyle = '#000';
    for(let r=0;r<n;r++) for(let k=0;k<n;k++) if(q.isDark(r,k)) c.fillRect((k+quiet)*cell, (r+quiet)*cell, cell, cell);
}
function liteQrBlock(id, code){ return `<div class="lite-qr"><canvas id="${id}"></canvas></div><details class="lite-files"><summary>Can't scan? Copy the code</summary><textarea class="lite-code" readonly onclick="this.select()">${code}</textarea><button type="button" class="lite-btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${code}').then(()=>liteToast('Copied','success',1200))"><i class="fas fa-copy"></i><span>Copy</span></button></details>`; }
async function liteRenderWifi(box){
    const peers = liteNetPeerList(), open = peers.filter(p=>p.state === 'open');
    const roster = (liteNet.roster || []).map(r=>`${liteEsc(TEAM_DISPLAY_NAMES[r.team] || r.team || r.dev)}${r.host?' (host)':''}`);
    let html = liteBack() + `<div class="lite-title">Share over Wi-Fi</div><div class="lite-hint">Put the devices on the same Wi-Fi, or on a hotspot made by one of the phones — no internet needed. Edits and chat messages are passed between all connected devices.</div>`;
    if(open.length || liteNet.role === 'client' && peers.length){
        html += `<div class="lite-card lite-s-on"><span class="lite-dot"></span><b>Connected${liteNet.role==='hub' ? ` — ${open.length} device(s)` : ''}</b></div>` +
            (roster.length ? `<div class="lite-roster">${roster.join(' · ')}</div>` : '');
    }
    if(liteWifi.step === 'offer'){
        html += `<div class="lite-title">1 · Let the other device scan this</div>${liteQrBlock('lite-qr-c', liteWifi.code)}
            <div class="lite-btns">${liteBtn('2 · Scan their answer', 'liteWifiScanAnswer()', 'fa-camera', 'lite-primary')}${liteBtn('Cancel', 'liteWifiCancel()', 'fa-xmark')}</div>
            <details class="lite-files"><summary>Paste their answer code instead</summary><textarea id="lite-paste" class="lite-code" placeholder="HL1.a.…"></textarea><button type="button" class="lite-btn" onclick="liteWifiAcceptText()"><i class="fas fa-check"></i><span>Connect</span></button></details>`;
    } else if(liteWifi.step === 'answer'){
        html += `<div class="lite-title">Show this to the host and let them scan it</div>${liteQrBlock('lite-qr-c', liteWifi.code)}<div class="lite-hint">Waiting for the host…</div>
            <div class="lite-btns">${liteBtn('Cancel', 'liteWifiCancel()', 'fa-xmark')}</div>`;
    } else {
        html += `<div class="lite-btns">${liteBtn('I am the host — add a device', 'liteWifiHost()', 'fa-tower-broadcast', 'lite-primary')}${liteBtn('Join a host (scan its code)', 'liteWifiJoin()', 'fa-camera')}${peers.length ? liteBtn('Disconnect all', 'liteNetLeave();liteRender()', 'fa-link-slash') : ''}</div>
            <details class="lite-files"><summary>Paste a host code instead</summary><textarea id="lite-paste" class="lite-code" placeholder="HL1.o.…"></textarea><button type="button" class="lite-btn" onclick="liteWifiJoinText()"><i class="fas fa-check"></i><span>Join</span></button></details>`;
    }
    box.innerHTML = html;
    const cv = document.getElementById('lite-qr-c'); if(cv) liteDrawQr(cv, liteWifi.code);
}
async function liteWifiHost(){
    try{ const r = await liteNetHostNew(); liteWifi = { step:'offer', code:r.code, peerId:r.peerId }; liteRender(); }
    catch(e){ liteToast(e.message || 'Could not start', 'error', 3200); }
}
async function liteWifiJoinWith(code){
    try{ const r = await liteNetJoin(code); liteWifi = { step:'answer', code:r.code, peerId:r.peerId }; liteRender(); }
    catch(e){ liteToast(e.message || 'Could not join', 'error', 3200); }
}
function liteWifiJoin(){ liteScanStart(code=>liteWifiJoinWith(code)); }
function liteWifiJoinText(){ const v = (document.getElementById('lite-paste')||{}).value; if(v) liteWifiJoinWith(v.trim()); }
async function liteWifiAcceptWith(code){
    try{ await liteNetHostAccept(liteWifi.peerId, code); liteWifi = { step:'start', code:'', peerId:null }; liteToast('Connecting…', 'info', 1800); liteRender(); }
    catch(e){ liteToast(e.message || 'Could not connect', 'error', 3200); }
}
function liteWifiScanAnswer(){ liteScanStart(code=>liteWifiAcceptWith(code)); }
function liteWifiAcceptText(){ const v = (document.getElementById('lite-paste')||{}).value; if(v) liteWifiAcceptWith(v.trim()); }
function liteWifiCancel(){ const p = liteNet.peers.get(liteWifi.peerId); if(p && p.state !== 'open') liteNetClose(p); liteWifi = { step:'start', code:'', peerId:null }; liteRender(); }

// ---------------- camera scanner ----------------
let liteScan = null;
function liteLoadJsQR(){
    return new Promise((res,rej)=>{
        if(window.jsQR) return res(window.jsQR);
        const emb = document.getElementById('lite-jsqr');
        const s = document.createElement('script');
        if(emb && emb.textContent.trim()){ s.textContent = emb.textContent; document.head.appendChild(s); return window.jsQR ? res(window.jsQR) : rej(new Error('Scanner not available')); }
        s.src = 'js/vendor/jsqr.min.js'; s.onload = ()=>res(window.jsQR); s.onerror = ()=>rej(new Error('Scanner not available')); document.head.appendChild(s);
    });
}
async function liteScanStart(onCode){
    liteScanStop();
    const ov = document.createElement('div'); ov.id = 'lite-scan'; ov.innerHTML = `<video playsinline muted></video><div class="lite-scan-frame"></div><div class="lite-scan-msg">Point the camera at the QR code</div><button type="button" class="lite-btn" onclick="liteScanStop()"><i class="fas fa-xmark"></i><span>Cancel</span></button>`;
    document.body.appendChild(ov);
    let stream;
    try{ stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }); }
    catch(e){ liteScanStop(); liteToast('Camera permission is needed to scan — or paste the code instead', 'error', 3600); return; }
    const video = ov.querySelector('video'); video.srcObject = stream; await video.play().catch(()=>{});
    liteScan = { ov, stream, stop:false };
    let detector = null; try{ if('BarcodeDetector' in window) detector = new BarcodeDetector({ formats:['qr_code'] }); }catch(e){}
    let jsqr = null; if(!detector){ try{ jsqr = await liteLoadJsQR(); }catch(e){ liteScanStop(); liteToast('Scanner not available — paste the code instead', 'error', 3600); return; } }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently:true });
    const loop = async()=>{
        if(!liteScan || liteScan.stop) return;
        let text = null;
        try{
            if(detector){ const r = await detector.detect(video); if(r.length) text = r[0].rawValue; }
            else if(video.videoWidth){ const w = 480, h = Math.round(480 * video.videoHeight / video.videoWidth); cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h); const r = jsqr(cx.getImageData(0,0,w,h).data, w, h); if(r) text = r.data; }
        }catch(e){}
        if(text && /^HL1\./.test(text)){ liteScanStop(); onCode(text); return; }
        setTimeout(loop, detector ? 150 : 120);
    };
    loop();
}
function liteScanStop(){
    if(!liteScan) { const o = document.getElementById('lite-scan'); if(o) o.remove(); return; }
    liteScan.stop = true; try{ liteScan.stream.getTracks().forEach(t=>t.stop()); }catch(e){} try{ liteScan.ov.remove(); }catch(e){} liteScan = null;
}

// ============================================================
// BANNER
// ============================================================
function liteBannerUpdate(){
    let b = document.getElementById('lite-banner');
    const show = liteIsEmergency();
    if(!show){ if(b) b.remove(); return; }
    if(!b){ b = document.createElement('div'); b.id = 'lite-banner'; b.onclick = ()=>openLiteSheet(); document.body.appendChild(b); }
    const n = liteDirtyList().length, peers = Array.from(liteNet.peers.values()).filter(p=>p.state === 'open').length;
    b.innerHTML = `<i class="fas fa-triangle-exclamation"></i> EMERGENCY · local data${n ? ` · ${n} unsynced` : ''}${peers ? ` · <i class="fas fa-wifi"></i> ${peers}` : ''}`;
}

// ============================================================
// LITE FILE START-UP
// ============================================================
function liteShowIdentityPicker(){
    let ov = document.getElementById('lite-who'); if(ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'lite-who';
    const pkg = window.HARFS_LITE_PKG || {};
    const names = (typeof TEAM_NAMES !== 'undefined' ? TEAM_NAMES : []);
    ov.innerHTML = `<div class="lite-who-box"><div class="lite-title">HARFS · Emergency copy</div><div class="lite-hint">League data from ${liteAgo((Array.from(liteFiles.values())[0]||{}).fetchedAt)}. Who is using this device?</div>
        <div class="lite-who-grid">${names.map(t=>`<button type="button" class="lite-btn" onclick="litePickIdentity('${t}')">${liteEsc((typeof TEAM_DISPLAY_NAMES!=='undefined'&&TEAM_DISPLAY_NAMES[t])||t)}${t==='Bayern'?' <i class="fas fa-shield-halved"></i>':''}</button>`).join('')}
</div>
        ${pkg.pin ? '<div class="lite-hint"><i class="fas fa-key"></i> The admin account asks for the Emergency PIN.</div>' : ''}</div>`;
    document.body.appendChild(ov);
}
async function litePickIdentity(team){
    const pkg = window.HARFS_LITE_PKG || {};
    if(team === 'Bayern' && pkg.pin){
        const pin = prompt('Emergency PIN'); if(pin === null) return;
        if((await litePinHash(pin, pkg.pin.salt)) !== pkg.pin.hash){ liteToast('Wrong PIN', 'error', 2200); return; }
    }
    loggedInTeam = team || 'Guest'; harfsSessionToken = 'lite-local';
    try{ localStorage.setItem('harfs_team', loggedInTeam); localStorage.setItem('harfs_session', 'lite-local'); }catch(e){}
    const ov = document.getElementById('lite-who'); if(ov) ov.remove();
    try{ hideLoginScreen(); }catch(e){}
    try{ updateHeaderForLogin(); }catch(e){}
    try{ navigate('main-league'); }catch(e){}
    try{ if(typeof harfsConsumePendingOpen === 'function') harfsConsumePendingOpen(); }catch(e){}
    liteBannerUpdate();
}
// ---- the normal app: keep the local copy fresh and remind about unsynced edits ----
async function liteAutoMaintain(){
    try{
        await liteSettled();
        if(liteIsEmergency() || !loggedInTeam || !harfsSessionToken || harfsSessionToken === 'lite-local') return;
        if(!(await liteNetOk())) return;
        if(Date.now() - (liteMeta.lastPull || 0) > 6*3600*1000 || liteFiles.size < LITE_FILES.length - 1){ await litePullAll(); }   // quietly, at most every 6 hours
        const n = liteDirtyList().length;
        if(n && loggedInTeam === 'Bayern') liteToast(`${n} file(s) edited while offline are not on GitHub yet — Settings → Emergency & Offline → Sync`, 'info', 6000);
    }catch(e){ /* never bother the user */ }
}
(function liteBoot(){
    if(!window.HARFS_LITE){
        window.addEventListener('load', ()=>{ setTimeout(liteBannerUpdate, 500); setTimeout(liteAutoMaintain, 9000); });
        window.addEventListener('online', ()=>setTimeout(liteAutoMaintain, 3000));
        return;
    }
    document.documentElement.classList.add('lite-mode');
    window.liteBootPromise = (async()=>{
        await liteReady;
        const pkg = window.HARFS_LITE_PKG;
        try{
            if(pkg && (liteMeta.pkgCreated || 0) < pkg.created){
                await liteImportPackage(pkg, { prefer:'newer' });
                liteMeta.pkgCreated = pkg.created; await liteSaveMeta();
            }
            if(pkg && pkg.logos){ for(const t of Object.keys(pkg.logos)){ try{ if(typeof teamLogoDataUrls !== 'undefined') teamLogoDataUrls[t] = pkg.logos[t]; await idbSet('teamLogos', t, { dataUrl:pkg.logos[t] }); }catch(e){} } }
        }catch(e){ console.warn('[lite] import failed', e); }
    })();
    // no Worker here: the identity is simply chosen on this device
    window.showLoginScreen = function(){ liteShowIdentityPicker(); };
    window.logoutTeam = function(){ loggedInTeam = null; harfsSessionToken = null; try{ localStorage.removeItem('harfs_team'); localStorage.removeItem('harfs_session'); }catch(e){} try{ updateHeaderForLogin(); }catch(e){} liteShowIdentityPicker(); };
    if(!loggedInTeam || harfsSessionToken !== 'lite-local'){ loggedInTeam = null; harfsSessionToken = null; }
    window.addEventListener('DOMContentLoaded', ()=>{ liteBannerUpdate(); });
})();
