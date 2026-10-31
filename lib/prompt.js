import readline from 'node:readline';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\x1b[2K',
  cursorUp: (n = 1) => `\x1b[${n}A`,
  cursorDown: (n = 1) => `\x1b[${n}B`,
  cursorToColumn1: '\x1b[1G'
};

/**
 * Interactive multi-select prompt using raw terminal mode.
 * @param {string} title
 * @param {Array<{id: string, label: string, hint?: string, selected?: boolean}>} items
 * @returns {Promise<string[]>} selected IDs
 */
export async function multiSelect(title, items) {
  if (!process.stdin.isTTY) {
    // Non-interactive fallback: select all by default
    console.log(`${title} (Non-interactive environment detected: selecting all)`);
    return items.map(i => i.id);
  }

  const state = items.map(item => ({
    id: item.id,
    label: item.label,
    hint: item.hint || '',
    selected: item.selected !== false
  }));

  let cursorIndex = 0;
  let firstRender = true;
  const numLines = state.length + 2; // title line + instructions line + items

  function render() {
    let output = '';
    if (!firstRender) {
      output += ANSI.cursorUp(numLines) + ANSI.cursorToColumn1;
    }

    output += `${ANSI.bold}${ANSI.cyan}? ${title}${ANSI.reset} ${ANSI.gray}(Space: toggle, 'a': all, Enter: confirm)${ANSI.reset}\n`;

    for (let i = 0; i < state.length; i++) {
      const item = state[i];
      const isCursor = i === cursorIndex;
      const cursorPrefix = isCursor ? `${ANSI.cyan}❯${ANSI.reset} ` : '  ';
      const checkbox = item.selected ? `${ANSI.green}☒${ANSI.reset}` : `${ANSI.gray}☐${ANSI.reset}`;
      const label = isCursor ? `${ANSI.bold}${item.label}${ANSI.reset}` : item.label;
      const hint = item.hint ? ` ${ANSI.gray}(${item.hint})${ANSI.reset}` : '';

      output += `${ANSI.clearLine}${cursorPrefix}${checkbox} ${label}${hint}\n`;
    }

    process.stdout.write(output);
    firstRender = false;
  }

  process.stdout.write(ANSI.hideCursor);
  render();

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str, key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(130);
      }

      if (key.name === 'up' || key.name === 'k') {
        cursorIndex = (cursorIndex - 1 + state.length) % state.length;
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        cursorIndex = (cursorIndex + 1) % state.length;
        render();
      } else if (key.name === 'space') {
        state[cursorIndex].selected = !state[cursorIndex].selected;
        render();
      } else if (str === 'a' || str === 'A') {
        const anyUnselected = state.some(s => !s.selected);
        state.forEach(s => (s.selected = anyUnselected));
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        const selectedIds = state.filter(s => s.selected).map(s => s.id);
        console.log(`\n${ANSI.green}✓${ANSI.reset} Selected ${selectedIds.length} item(s).\n`);
        resolve(selectedIds);
      }
    };

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw);
      }
      process.stdin.pause();
      process.stdout.write(ANSI.showCursor);
    }

    process.stdin.on('keypress', onKeypress);
  });
}
