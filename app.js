(() => {
  'use strict';

  const STORAGE_KEY = 'yuantutu-bookings-v1';
  const DAY_MS = 86400000;
  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const COURSES = {
    intro: { name: '上冰初体验', time: '10:00', duration: 30, description: '从站稳、滑行到安全停下，勇敢迈出第一步。', format: '入门体验 · 1 对 1' },
    private: { name: '一对一精进课', time: '14:00', duration: 60, description: '围绕你的进度，细细打磨滑行与动作。', format: '专属训练 · 1 对 1' },
    group: { name: '冰上小班课', time: '16:00', duration: 60, description: '和伙伴一起练习，让每一次进步都有回应。', format: '趣味共练 · 2–4 人' }
  };

  const $ = (id) => document.getElementById(id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const pad = (value) => String(value).padStart(2, '0');
  const chinaToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const asDate = (date) => new Date(`${date}T00:00:00Z`);
  const dateKey = (date) => date.toISOString().slice(0, 10);
  const addDays = (date, count) => dateKey(new Date(asDate(date).getTime() + count * DAY_MS));
  const weekdayIndex = (date) => (asDate(date).getUTCDay() + 6) % 7;
  const monday = (date) => addDays(date, -weekdayIndex(date));
  const friendlyDate = (date) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日 ${WEEKDAYS[weekdayIndex(date)]}`;
  const startMs = (date, course) => new Date(`${date}T${COURSES[course].time}:00+08:00`).getTime();
  const endTime = (course) => {
    const item = COURSES[course];
    const minutes = Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) + item.duration;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  };
  const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(asDate(value).getTime()) && dateKey(asDate(value)) === value;

  let today = chinaToday();
  let baseWeek = monday(today);
  let weekOffset = 0;
  let selectedDate = today;
  let filter = 'all';
  let currentSlot = null;
  let records = [];
  let readFailed = false;

  function loadRecords() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed)) throw new Error('Invalid saved records');
      records = parsed.filter((item) => item && typeof item.id === 'string' && validDate(item.date) &&
        Object.prototype.hasOwnProperty.call(COURSES, item.course) &&
        typeof item.name === 'string' && typeof item.level === 'string' && typeof item.notes === 'string' &&
        ['active', 'cancelled'].includes(item.status));
      readFailed = false;
    } catch (_) {
      records = [];
      readFailed = true;
    }
  }

  function persist(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      records = next;
      readFailed = false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function savedFor(date, course) {
    return records.some((item) => item.status === 'active' && item.date === date && item.course === course);
  }

  function slotState(date, course) {
    if (startMs(date, course) <= Date.now()) return { available: false, label: '已过时段', reason: '这个时段已经过去啦' };
    if (savedFor(date, course)) return { available: false, label: '已存意向', reason: '本机已有这节课的约课意向' };
    const index = Object.keys(COURSES).indexOf(course);
    const dayNumber = Math.floor(asDate(date).getTime() / DAY_MS);
    if ((dayNumber + index * 3) % 7 === 0) return { available: false, label: '示例已满', reason: '这个示例时段暂不可选' };
    return { available: true, label: course === 'group' ? `示例余 ${2 + dayNumber % 2} 位` : '示例可约', reason: '' };
  }

  function visibleCourses() {
    return filter === 'all' ? Object.keys(COURSES) : [filter];
  }

  function availableCount(date) {
    return visibleCourses().filter((course) => slotState(date, course).available).length;
  }

  function renderSchedule() {
    const strip = $('date-strip');
    const list = $('slot-list');
    if (!strip || !list) return;
    const first = addDays(baseWeek, weekOffset * 7);
    const last = addDays(first, 6);
    if ($('week-label')) $('week-label').textContent = `${Number(first.slice(5, 7))}.${pad(Number(first.slice(8)))} — ${Number(last.slice(5, 7))}.${pad(Number(last.slice(8)))}`;
    if ($('month-label')) $('month-label').textContent = `${first.slice(0, 4)} 年 ${Number(first.slice(5, 7))} 月`;
    if ($('prev-week')) $('prev-week').disabled = weekOffset <= 0;
    if ($('next-week')) $('next-week').disabled = weekOffset >= 8;
    if ($('selected-date-label')) $('selected-date-label').textContent = friendlyDate(selectedDate);
    const count = availableCount(selectedDate);
    if ($('slot-count')) $('slot-count').textContent = `${count} 个可选时段`;

    strip.replaceChildren();
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(first, index);
      const isSelected = date === selectedDate;
      const button = make('button', `date-btn${isSelected ? ' selected' : ''}${date === today ? ' is-today' : ''}`);
      button.type = 'button';
      button.dataset.date = date;
      button.setAttribute('aria-pressed', String(isSelected));
      button.setAttribute('aria-label', `${friendlyDate(date)}${date === today ? '，今天' : ''}，${availableCount(date)} 个可选时段`);
      button.append(make('span', 'day-name', date === today ? '今天' : WEEKDAYS[index]));
      button.append(make('span', 'day-number', Number(date.slice(8))));
      const countForDay = availableCount(date);
      button.append(make('span', 'day-availability', date < today ? '已结束' : countForDay ? `${countForDay} 节可选` : '暂无可选'));
      button.addEventListener('click', () => {
        selectedDate = date;
        renderSchedule();
        strip.querySelector(`[data-date="${date}"]`)?.focus({ preventScroll: true });
      });
      strip.append(button);
    }

    list.replaceChildren();
    visibleCourses().forEach((courseKey) => {
      const course = COURSES[courseKey];
      const state = slotState(selectedDate, courseKey);
      const card = make('article', `slot-card${state.available ? '' : ' is-unavailable'}`);
      const main = make('div', 'slot-main');
      const time = make('div', 'slot-time');
      time.append(make('strong', '', course.time), make('span', '', `${course.duration} 分钟`));
      const info = make('div', 'slot-info');
      info.append(make('span', 'slot-type', course.format), make('h3', '', course.name), make('p', '', course.description));
      main.append(time, info);
      const action = make('div', 'slot-action');
      action.append(make('span', 'slot-status', state.label));
      const button = make('button', 'btn btn-small ' + (state.available ? 'btn-primary' : 'btn-outline'), state.available ? '选这节课 ↗' : state.label);
      button.type = 'button';
      button.disabled = !state.available;
      button.setAttribute('aria-label', state.available ? `选择 ${friendlyDate(selectedDate)} ${course.time} ${course.name}` : `${course.time} ${course.name}：${state.reason}`);
      const date = selectedDate;
      button.addEventListener('click', () => openBooking(date, courseKey));
      action.append(button);
      card.append(main, action);
      list.append(card);
    });
    document.querySelectorAll('[data-filter]').forEach((button) => {
      const selected = button.dataset.filter === filter;
      button.classList.toggle('selected', selected);
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    updateBadge();
  }

  function updateBadge() {
    const count = records.filter((record) => record.status === 'active').length;
    const badge = $('booking-count');
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  function openBooking(date, course) {
    loadRecords();
    if (!slotState(date, course).available) {
      renderSchedule();
      return;
    }
    currentSlot = { date, course };
    const form = $('booking-form');
    form?.reset();
    if ($('booking-fields')) $('booking-fields').hidden = false;
    if ($('booking-success')) $('booking-success').hidden = true;
    if ($('save-booking')) {
      $('save-booking').hidden = false;
      $('save-booking').disabled = false;
    }
    if ($('form-error')) $('form-error').textContent = '';
    if ($('booking-summary')) {
      const summary = $('booking-summary');
      summary.replaceChildren(
        make('strong', '', COURSES[course].name),
        make('span', '', `${friendlyDate(date)} · ${COURSES[course].time}–${endTime(course)}`),
        make('span', 'muted', '北京时间 · 示例冰场，地点待教练确认')
      );
    }
    openDialog($('booking-dialog'));
    window.setTimeout(() => $('student-name')?.focus(), 0);
  }

  function formError(message) {
    const node = $('form-error');
    if (node) node.textContent = message;
  }

  function submitBooking(event) {
    event.preventDefault();
    const form = $('booking-form');
    if (!currentSlot || !form?.reportValidity()) return;
    const name = $('student-name')?.value.trim() || '';
    const notes = $('booking-notes')?.value.trim() || '';
    if (!name || name.length > 24) {
      formError('请填写学员称呼，最多 24 个字。');
      $('student-name')?.focus();
      return;
    }
    if (notes.length > 200) {
      formError('备注最多填写 200 个字。');
      return;
    }
    if (!$('consent')?.checked) {
      formError('请先确认知悉：这里只保存本机约课意向。');
      return;
    }
    loadRecords();
    if (readFailed) {
      formError('暂时无法读取本机记录。请允许浏览器使用本地存储后重试；意向尚未保存。');
      return;
    }
    const state = slotState(currentSlot.date, currentSlot.course);
    if (!state.available) {
      formError(`${state.reason}，请关闭窗口后选择其他时段。`);
      renderSchedule();
      return;
    }
    const record = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: currentSlot.date,
      course: currentSlot.course,
      name,
      level: $('student-level')?.value || '未填写',
      notes,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    if (!persist([...records, record])) {
      formError('本机存储空间不足或浏览器限制了存储，意向尚未保存。请调整浏览器设置后重试。');
      return;
    }
    if ($('booking-fields')) $('booking-fields').hidden = true;
    if ($('save-booking')) $('save-booking').hidden = true;
    if ($('booking-success')) $('booking-success').hidden = false;
    const success = $('booking-success-content');
    if (success) {
      success.replaceChildren(
        make('p', '', '示例预约，未发送给教练。实际时间、地点与费用需另行和教练确认。'),
        make('p', 'record-title', `${record.name} · ${COURSES[record.course].name}`),
        make('p', 'record-meta', `${friendlyDate(record.date)} ${COURSES[record.course].time}–${endTime(record.course)} · 北京时间`)
      );
      const download = make('button', 'btn btn-outline btn-small', '加入日历（待确认）');
      download.type = 'button';
      download.addEventListener('click', () => downloadCalendar(record));
      success.append(download);
    }
    currentSlot = null;
    renderSchedule();
    $('success-close')?.focus();
  }

  function renderRecords() {
    const list = $('records-list');
    if (!list) return;
    list.replaceChildren();
    if (readFailed) {
      list.append(make('p', 'empty-state', '暂时无法读取本机记录。请检查浏览器的本地存储设置。'));
      return;
    }
    if (!records.length) {
      list.append(make('p', 'empty-state', '还没有约课意向。去课表挑一段属于你的冰上时光吧。'));
      return;
    }
    list.append(make('p', 'muted', '记录仅保存在当前浏览器，未发送给教练。清除浏览器数据会移除记录。'));
    [...records].sort((left, right) => startMs(right.date, right.course) - startMs(left.date, left.course)).forEach((record) => {
      const card = make('article', 'record-card');
      const isPast = startMs(record.date, record.course) <= Date.now();
      const label = record.status === 'cancelled' ? '本机意向已取消' : isPast ? '时段已过 · 示例意向' : '本机意向 · 待确认';
      card.append(
        make('span', 'slot-status', label),
        make('h3', 'record-title', `${record.name} · ${COURSES[record.course].name}`),
        make('p', 'record-meta', `${friendlyDate(record.date)} · ${COURSES[record.course].time}–${endTime(record.course)} · 北京时间`),
        make('p', 'record-meta', `滑冰基础：${record.level}`)
      );
      if (record.notes) card.append(make('p', 'record-meta', `备注：${record.notes}`));
      if (record.status === 'active') {
        const actions = make('div', 'record-actions');
        const download = make('button', 'btn btn-outline btn-small', '下载日历');
        download.type = 'button';
        download.addEventListener('click', () => downloadCalendar(record));
        const cancel = make('button', 'btn btn-outline btn-small', '取消本机意向');
        cancel.type = 'button';
        cancel.addEventListener('click', () => {
          const confirmation = make('div', 'record-cancel-confirm');
          confirmation.append(make('p', '', '取消这条本机意向？此操作不会通知教练。'));
          const confirm = make('button', 'btn btn-primary btn-small', '确认取消');
          confirm.type = 'button';
          const back = make('button', 'btn btn-outline btn-small', '保留意向');
          back.type = 'button';
          back.addEventListener('click', () => {
            confirmation.replaceWith(actions);
            cancel.focus();
          });
          confirm.addEventListener('click', () => {
            loadRecords();
            if (readFailed || !persist(records.map((item) => item.id === record.id ? { ...item, status: 'cancelled' } : item))) {
              let error = confirmation.querySelector('[role="alert"]');
              if (!error) {
                error = make('p', 'record-feedback');
                error.setAttribute('role', 'alert');
                confirmation.append(error);
              }
              error.textContent = '无法更新本机记录，请检查浏览器的存储设置后重试。';
              return;
            }
            renderRecords();
            renderSchedule();
            $('records-close')?.focus();
          });
          confirmation.append(confirm, back);
          actions.replaceWith(confirmation);
          confirm.focus();
        });
        actions.append(download, cancel);
        card.append(actions);
      }
      list.append(card);
    });
  }

  function downloadCalendar(record) {
    const escapeICS = (value) => String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const start = startMs(record.date, record.course);
    const course = COURSES[record.course];
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yuan Tutu//Demo Booking Intent//ZH', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', `UID:${escapeICS(record.id)}@yuantutu.local`, `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + course.duration * 60000)}`,
      `SUMMARY:${escapeICS(`袁兔子教练 · ${course.name}（示例意向，待确认）`)}`,
      `DESCRIPTION:${escapeICS(`仅为本机保存的示例约课意向，未发送给教练，也未获教练确认。实际时间、冰场与费用请另行联系教练确认。\n学员：${record.name}\n滑冰基础：${record.level}${record.notes ? `\n备注：${record.notes}` : ''}`)}`,
      'LOCATION:示例冰场（待教练确认）', 'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR'
    ];
    // RFC 5545 limits content lines to 75 UTF-8 octets. Fold at safe character boundaries.
    const encoder = new TextEncoder();
    const fold = (line) => {
      let output = '';
      let length = 0;
      for (const character of line) {
        const bytes = encoder.encode(character).length;
        if (length + bytes > 75) {
          output += '\r\n ';
          length = 1;
        }
        output += character;
        length += bytes;
      }
      return output;
    };
    const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = make('a');
    anchor.href = url;
    anchor.download = `袁兔子教练-${record.date}-示例意向.ics`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function closeMobileMenu() {
    const toggle = $('menu-toggle');
    const menu = $('mobile-nav');
    toggle?.setAttribute('aria-expanded', 'false');
    if (menu) {
      menu.hidden = true;
      menu.classList.remove('is-open');
    }
  }

  function init() {
    loadRecords();
    renderSchedule();
    $('prev-week')?.addEventListener('click', () => {
      if (weekOffset <= 0) return;
      weekOffset -= 1;
      selectedDate = addDays(selectedDate, -7);
      renderSchedule();
    });
    $('next-week')?.addEventListener('click', () => {
      if (weekOffset >= 8) return;
      weekOffset += 1;
      selectedDate = addDays(selectedDate, 7);
      renderSchedule();
    });
    $('today')?.addEventListener('click', () => {
      today = chinaToday();
      baseWeek = monday(today);
      weekOffset = 0;
      selectedDate = today;
      renderSchedule();
    });
    document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.filter !== 'all' && !Object.prototype.hasOwnProperty.call(COURSES, button.dataset.filter)) return;
      filter = button.dataset.filter;
      renderSchedule();
    }));
    document.querySelectorAll('[data-course]').forEach((button) => button.addEventListener('click', (event) => {
      if (!Object.prototype.hasOwnProperty.call(COURSES, button.dataset.course)) return;
      event.preventDefault();
      filter = button.dataset.course;
      renderSchedule();
      $('schedule')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      closeMobileMenu();
    }));
    $('booking-form')?.addEventListener('submit', submitBooking);
    $('dialog-close')?.addEventListener('click', () => $('booking-dialog')?.close());
    $('success-close')?.addEventListener('click', () => $('booking-dialog')?.close());
    $('records-close')?.addEventListener('click', () => $('records-dialog')?.close());
    document.querySelectorAll('[data-open-records]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      closeMobileMenu();
      loadRecords();
      updateBadge();
      renderRecords();
      openDialog($('records-dialog'));
    }));
    [$('booking-dialog'), $('records-dialog')].filter(Boolean).forEach((dialog) => {
      let pointerStartedOutside = false;
      const outside = (event) => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      };
      dialog.addEventListener('pointerdown', (event) => { pointerStartedOutside = event.target === dialog && outside(event); });
      dialog.addEventListener('click', (event) => {
        if (pointerStartedOutside && event.target === dialog && outside(event)) dialog.close();
        pointerStartedOutside = false;
      });
    });
    $('booking-dialog')?.addEventListener('close', () => { currentSlot = null; });
    $('menu-toggle')?.addEventListener('click', () => {
      const toggle = $('menu-toggle');
      const menu = $('mobile-nav');
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      if (menu) {
        menu.hidden = !open;
        menu.classList.toggle('is-open', open);
      }
    });
    $('mobile-nav')?.querySelectorAll('a').forEach((anchor) => anchor.addEventListener('click', closeMobileMenu));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMobileMenu(); });
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      loadRecords();
      renderSchedule();
      if ($('records-dialog')?.open) renderRecords();
    });
    // Keep China-date boundaries and the past-slot checks correct when the page stays open.
    window.setInterval(() => {
      const nextToday = chinaToday();
      if (nextToday !== today) {
        today = nextToday;
        baseWeek = monday(today);
        weekOffset = 0;
        selectedDate = today;
      }
      if (!document.hidden) renderSchedule();
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
