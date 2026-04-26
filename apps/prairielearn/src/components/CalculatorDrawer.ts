import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';

import { compiledScriptTag, compiledStylesheetTag, nodeModulesAssetPath } from '../lib/assets.js';

export function CalculatorDrawerHeadScripts(): HtmlSafeString {
  return html`
    <script src="${nodeModulesAssetPath('mathlive/mathlive.min.js')}"></script>
    ${compiledScriptTag('calculatorClient.ts')} ${compiledStylesheetTag('calculator.css')}
  `;
}

export function CalculatorDrawerToggle({
  showInfoPopover = false,
}: { showInfoPopover?: boolean } = {}): HtmlSafeString {
  // TODO: there might be more tools, which makes this card not calculator specific.

  const toolsTitleContent = html`<div class="d-flex justify-content-between flex-nowrap">
    Tools
    <span class="badge color-green1">New</span>
  </div>`;

  const toolsPopoverContent = html`
    Tools can be enabled
    <a
      href="https://docs.prairielearn.com/assessment/configuration/#enabling-tools-for-an-entire-assessment"
      >per-assessment</a
    >
    or
    <a href="https://docs.prairielearn.com/assessment/configuration/#overriding-tools-per-zone"
      >per-zone</a
    >
    in <code>infoAssessment.json</code> and are disabled by default. Please give us
    <a
      href="https://github.com/PrairieLearn/PrairieLearn/discussions/14448"
      target="_blank"
      rel="noopener noreferrer"
      >feedback</a
    >!
  `;

  return html`
    <div class="card mb-4">
      <div class="card-header bg-secondary text-white d-flex align-items-center">
        <span>Tools</span>
        ${showInfoPopover
          ? html`
              <button
                type="button"
                class="btn btn-link btn-sm ms-auto text-white border-0 p-0"
                data-bs-toggle="popover"
                data-bs-container="body"
                data-bs-html="true"
                data-bs-title="${escapeHtml(toolsTitleContent)}"
                data-bs-content="${escapeHtml(toolsPopoverContent)}"
                data-bs-placement="auto"
              >
                <i class="bi bi-question-circle" aria-hidden="true"></i>
              </button>
            `
          : ''}
      </div>
      <div class="card-body">
        <button type="button" class="btn btn-outline-secondary w-100" id="calculatorDrawerToggle">
          <i class="bi bi-calculator"></i> Calculator
        </button>
      </div>
    </div>
  `;
}

export function CalculatorDrawer({ storageKey }: { storageKey: string }): HtmlSafeString {
  return html`
    <button
      type="button"
      class="calculator-fab btn btn-secondary rounded-pill shadow align-items-center gap-1 mb-3 me-3"
      id="calculatorFab"
      aria-label="Open calculator"
    >
      <i class="bi bi-calculator"></i>
      <span> Calculator </span>
      <i class="bi bi-chevron-up"></i>
      <span class="calculator-fab-close" id="calculatorFabClose">
        <i class="bi bi-x-lg"></i>
      </span>
    </button>
    <section
      class="calculator-drawer d-flex flex-column overflow-hidden"
      id="calculatorDrawer"
      aria-label="Calculator"
      data-storage-key="${storageKey}"
    >
      <div class="calculator-resize-handle" id="calculatorResizeHandle"></div>
      <button
        type="button"
        class="calculator-drawer-header d-flex align-items-center justify-content-between flex-shrink-0 bg-secondary text-white user-select-none border-0 w-100"
        id="calculatorDrawerClose"
        aria-label="Toggle calculator"
      >
        <span class="fw-medium small"> <i class="bi bi-calculator"></i> Calculator </span>
        <i class="bi bi-chevron-down"></i>
      </button>
      <div class="calculator-drawer-body overflow-auto flex-grow-1">
        <div
          class="d-flex align-items-center justify-content-between px-2 py-1 border border-bottom-0 bg-body-secondary"
        >
          <span class="small text-body-secondary">History</span>
          <button
            type="button"
            class="btn-link link-danger small p-0 border-0 bg-transparent d-none"
            id="calculatorClearHistory"
          >
            Clear all
          </button>
        </div>
        <div
          id="history-panel"
          class="history-panel d-flex flex-column-reverse overflow-auto bg-body-tertiary p-0 border border-bottom-0"
        ></div>

        <template id="history-item-template">
          <div class="history-item d-flex align-items-stretch border-top">
            <div class="history-content flex-grow-1 d-flex flex-column">
              <div class="history-row history-input d-flex align-items-center gap-2 ps-2 pe-2">
                <math-field
                  theme="light"
                  class="pl-calculator-history-text flex-grow-1 force-light"
                  contenteditable="false"
                ></math-field>
                <button
                  type="button"
                  class="calculator-action-btn history-action-btn history-copy-btn"
                  data-bs-toggle="tooltip"
                  data-bs-placement="left"
                  data-bs-delay="300"
                  data-bs-title="Copy to clipboard"
                >
                  <i class="bi bi-copy"></i>
                </button>
                <button
                  type="button"
                  class="calculator-action-btn history-action-btn history-insert-btn"
                  data-bs-toggle="tooltip"
                  data-bs-placement="left"
                  data-bs-delay="300"
                  data-bs-title="Insert into input"
                >
                  <i class="bi bi-box-arrow-in-down"></i>
                </button>
              </div>
              <div
                class="history-row history-output d-flex align-items-center gap-2 text-body-secondary ps-4 pe-2 small"
                data-testid="history-output"
              >
                <math-field
                  theme="light"
                  class="pl-calculator-history-text force-light"
                  contenteditable="false"
                ></math-field>
                <button
                  type="button"
                  class="history-mode-badge badge"
                  data-bs-toggle="tooltip"
                  data-bs-placement="left"
                  data-bs-delay="300"
                  data-bs-title="Toggle deg/rad"
                ></button>
                <button
                  type="button"
                  class="calculator-action-btn history-action-btn history-copy-btn ms-auto"
                  data-bs-toggle="tooltip"
                  data-bs-placement="left"
                  data-bs-delay="300"
                  data-bs-title="Copy to clipboard"
                >
                  <i class="bi bi-copy"></i>
                </button>
                <button
                  type="button"
                  class="calculator-action-btn history-action-btn history-insert-btn"
                  data-bs-toggle="tooltip"
                  data-bs-placement="left"
                  data-bs-delay="300"
                  data-bs-title="Insert into input"
                >
                  <i class="bi bi-box-arrow-in-down"></i>
                </button>
              </div>
            </div>
          </div>
        </template>

        <div class="calculator-input-group border">
          <div class="input-container d-flex align-items-center px-1">
            <math-field
              theme="light"
              id="calculator-input"
              class="pl-calculator-input flex-grow-1 force-light"
              autofocus="autofocus"
              placeholder="\\mathrm{Use\\ keyboard\\ or\\ buttons\\ below\\ to\\ start}"
              autocomplete="off"
              data-enable-grammarly="false"
            >
            </math-field>
            <button
              type="button"
              class="calculator-action-btn"
              name="clear"
              data-bs-toggle="tooltip"
              data-bs-placement="left"
              data-bs-delay="300"
              data-bs-title="Clear input"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div
            id="calculator-output-panel"
            class="output-panel d-flex align-items-center gap-2 px-1"
          >
            <math-field
              theme="light"
              id="calculator-output"
              class="pl-calculator-output flex-grow-1 force-light"
              contenteditable="false"
              placeholder="\\mathrm{Output\\ will\\ be\\ displayed\\ here}"
            >
            </math-field>
            <button
              id="calculator-output-copy"
              type="button"
              class="calculator-action-btn"
              data-bs-toggle="tooltip"
              data-bs-placement="left"
              data-bs-delay="300"
              data-bs-title="Copy this output"
            >
              <i class="bi bi-copy"></i>
            </button>
          </div>
        </div>

        <div class="calculator-main bg-body-secondary overflow-hidden p-2 border">
          <div
            class="d-flex align-items-center justify-content-between flex-nowrap gap-3 mb-2 px-1"
          >
            <div
              class="btn-group btn-group-sm"
              role="group"
              aria-label="Calculator keyboard subgroup panel"
            >
              <input
                type="radio"
                class="btn-check"
                name="btnradio"
                id="main-btn"
                data-panel="main"
                checked
              />
              <label class="btn btn-outline-secondary" for="main-btn">main</label>

              <input type="radio" class="btn-check" name="btnradio" id="abc-btn" data-panel="abc" />
              <label class="btn btn-outline-secondary" for="abc-btn">abc</label>

              <input
                type="radio"
                class="btn-check"
                name="btnradio"
                id="func-btn"
                data-panel="func"
              />
              <label class="btn btn-outline-secondary" for="func-btn">func</label>
            </div>

            <div class="d-flex align-items-center gap-3">
              <div
                class="form-check form-switch d-flex align-items-center text-nowrap small ps-0"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                title="decimal or fractional"
              >
                <span class="toggle-label">dec</span>
                <input
                  class="form-check-input mx-1"
                  type="checkbox"
                  id="displayModeSwitch"
                  aria-label="Toggle decimal or fractional display"
                />
                <span class="toggle-label">frac</span>
              </div>

              <div
                class="form-check form-switch d-flex align-items-center text-nowrap small ps-0"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                title="radian or degree"
              >
                <span class="toggle-label">rad</span>
                <input
                  class="form-check-input mx-1"
                  type="checkbox"
                  id="angleModeSwitch"
                  aria-label="Toggle radian or degree mode"
                />
                <span class="toggle-label">deg</span>
              </div>
            </div>
          </div>

          <div
            id="main-keyboard"
            class="keyboard main flex-row align-items-stretch justify-content-center"
          >
            <button
              type="button"
              class="col-nav col-nav-left flex-shrink-0 align-items-center justify-content-center"
              aria-label="Scroll left"
            >
              <i class="bi bi-chevron-left"></i>
            </button>
            <div class="col-functions d-flex flex-column flex-shrink-0">
              <div class="btn-row d-flex">
                <button name="sqr" type="button" class="btn btn-light">$a^2$</button
                ><button name="apowerb" type="button" class="btn btn-light">$a^b$</button
                ><button name="epowerx" type="button" class="btn btn-light">$e^x$</button
                ><button name="ln" type="button" class="btn btn-light">$\\ln$</button>
              </div>
              <div class="btn-row d-flex">
                <button name="sqrt" type="button" class="btn btn-light">$\\sqrt{a}$</button
                ><button name="root" type="button" class="btn btn-light">$\\sqrt[b]{a}$</button
                ><button name="abs" type="button" class="btn btn-light">$\\left| a \\right|$</button
                ><button name="log" type="button" class="btn btn-light">$\\log_{a}{b}$</button>
              </div>
              <div class="btn-row d-flex">
                <button name="sin" type="button" class="btn btn-light">$\\sin$</button
                ><button name="cos" type="button" class="btn btn-light">$\\cos$</button
                ><button name="tan" type="button" class="btn btn-light">$\\tan$</button
                ><button name="lg" type="button" class="btn btn-light">$\\log_{10}$</button>
              </div>
              <div class="btn-row d-flex">
                <button name="sin-1" type="button" class="btn btn-light">$\\sin^{-1}$</button
                ><button name="cos-1" type="button" class="btn btn-light">$\\cos^{-1}$</button
                ><button name="tan-1" type="button" class="btn btn-light">$\\tan^{-1}$</button
                ><button name="pi" type="button" class="btn btn-light">$\\pi$</button>
              </div>
            </div>
            <div class="col-numbers d-flex flex-column flex-shrink-0">
              <div class="btn-row d-flex">
                <button data-key="7" type="button" class="btn btn-secondary btn-key">7</button
                ><button data-key="8" type="button" class="btn btn-secondary btn-key">8</button
                ><button data-key="9" type="button" class="btn btn-secondary btn-key">9</button
                ><button name="div" type="button" class="btn btn-light">$\\div$</button>
              </div>
              <div class="btn-row d-flex">
                <button data-key="4" type="button" class="btn btn-secondary btn-key">4</button
                ><button data-key="5" type="button" class="btn btn-secondary btn-key">5</button
                ><button data-key="6" type="button" class="btn btn-secondary btn-key">6</button
                ><button name="mul" type="button" class="btn btn-light">$\\times$</button>
              </div>
              <div class="btn-row d-flex">
                <button data-key="1" type="button" class="btn btn-secondary btn-key">1</button
                ><button data-key="2" type="button" class="btn btn-secondary btn-key">2</button
                ><button data-key="3" type="button" class="btn btn-secondary btn-key">3</button
                ><button name="minus" type="button" class="btn btn-light">$-$</button>
              </div>
              <div class="btn-row d-flex">
                <button data-key="0" type="button" class="btn btn-secondary btn-key">0</button
                ><button name="dec-point" type="button" class="btn btn-secondary">.</button
                ><button name="ans" type="button" class="btn btn-light">ans</button
                ><button name="plus" type="button" class="btn btn-light">$+$</button>
              </div>
            </div>
            <button
              type="button"
              class="col-nav col-nav-right flex-shrink-0 align-items-center justify-content-center"
              aria-label="Scroll right"
            >
              <i class="bi bi-chevron-right"></i>
            </button>
            <div class="col-extras d-flex flex-column flex-shrink-0">
              <div class="btn-row d-flex">
                <button name="perc" type="button" class="btn btn-light">%</button
                ><button name="frac" type="button" class="btn btn-light">$\\frac{a}{b}$</button>
              </div>
              <div class="btn-row d-flex">
                <button name="lpar" type="button" class="btn btn-light">(</button
                ><button name="rpar" type="button" class="btn btn-light">)</button>
              </div>
              <div class="btn-row d-flex">
                <button name="left" type="button" class="btn btn-light" aria-label="Move left">
                  <i class="bi bi-arrow-left"></i></button
                ><button name="right" type="button" class="btn btn-light" aria-label="Move right">
                  <i class="bi bi-arrow-right"></i>
                </button>
              </div>
              <div class="btn-row d-flex">
                <button name="backspace" type="button" class="btn btn-light" aria-label="Backspace">
                  <i class="bi bi-backspace"></i></button
                ><button
                  name="calculate"
                  type="button"
                  class="btn btn-success"
                  aria-label="Calculate"
                >
                  <i class="bi bi-arrow-return-left"></i>
                </button>
              </div>
            </div>
          </div>

          <div
            id="abc-keyboard"
            class="keyboard abc flex-column align-items-stretch justify-content-center"
          >
            <div id="abc-row-1" class="btn-row d-flex justify-content-center">
              <button data-key="q" type="button" class="btn btn-light btn-key">q</button>
              <button data-key="w" type="button" class="btn btn-light btn-key">w</button>
              <button data-key="e" type="button" class="btn btn-light btn-key">e</button>
              <button data-key="r" type="button" class="btn btn-light btn-key">r</button>
              <button data-key="t" type="button" class="btn btn-light btn-key">t</button>
              <button data-key="y" type="button" class="btn btn-light btn-key">y</button>
              <button data-key="u" type="button" class="btn btn-light btn-key">u</button>
              <button data-key="i" type="button" class="btn btn-light btn-key">i</button>
              <button data-key="o" type="button" class="btn btn-light btn-key">o</button>
              <button data-key="p" type="button" class="btn btn-light btn-key">p</button>
            </div>
            <div id="abc-row-2" class="btn-row d-flex justify-content-center">
              <button data-key="a" type="button" class="btn btn-light btn-key">a</button>
              <button data-key="s" type="button" class="btn btn-light btn-key">s</button>
              <button data-key="d" type="button" class="btn btn-light btn-key">d</button>
              <button data-key="f" type="button" class="btn btn-light btn-key">f</button>
              <button data-key="g" type="button" class="btn btn-light btn-key">g</button>
              <button data-key="h" type="button" class="btn btn-light btn-key">h</button>
              <button data-key="j" type="button" class="btn btn-light btn-key">j</button>
              <button data-key="k" type="button" class="btn btn-light btn-key">k</button>
              <button data-key="l" type="button" class="btn btn-light btn-key">l</button>
            </div>
            <div id="abc-row-3" class="btn-row d-flex justify-content-center">
              <button name="eq" type="button" class="btn btn-light">=</button>
              <button data-key="z" type="button" class="btn btn-light btn-key">z</button>
              <button data-key="x" type="button" class="btn btn-light btn-key">x</button>
              <button data-key="c" type="button" class="btn btn-light btn-key">c</button>
              <button data-key="v" type="button" class="btn btn-light btn-key">v</button>
              <button data-key="b" type="button" class="btn btn-light btn-key">b</button>
              <button data-key="n" type="button" class="btn btn-light btn-key">n</button>
              <button data-key="m" type="button" class="btn btn-light btn-key">m</button>
              <button name="assign" type="button" class="btn btn-light">$:=$</button>
              <button name="backspace" type="button" class="btn btn-light" aria-label="Backspace">
                <i class="bi bi-backspace"></i>
              </button>
            </div>
            <div id="abc-row-4" class="btn-row d-flex justify-content-center">
              <button name="shift" type="button" class="btn btn-light btn-wide" aria-label="Shift">
                <i class="bi bi-arrow-up"></i>
              </button>
              <button name="lpar" type="button" class="btn btn-light">(</button>
              <button name="rpar" type="button" class="btn btn-light">)</button>
              <button name="lbra" type="button" class="btn btn-light">[</button>
              <button name="rbra" type="button" class="btn btn-light">]</button>
              <button name="factorial" type="button" class="btn btn-light">$!$</button>
              <button name="pi" type="button" class="btn btn-light">$\\pi$</button>
              <button name="left" type="button" class="btn btn-light" aria-label="Move left">
                <i class="bi bi-arrow-left"></i>
              </button>
              <button name="right" type="button" class="btn btn-light" aria-label="Move right">
                <i class="bi bi-arrow-right"></i>
              </button>
              <button
                name="calculate"
                type="button"
                class="btn btn-success btn-wide"
                aria-label="Calculate"
              >
                <i class="bi bi-arrow-return-left"></i>
              </button>
            </div>
          </div>

          <div
            id="func-keyboard"
            class="keyboard func flex-row align-items-stretch justify-content-center"
          >
            <button
              type="button"
              class="col-nav col-nav-left flex-shrink-0 align-items-center justify-content-center"
              aria-label="Scroll left"
            >
              <i class="bi bi-chevron-left"></i>
            </button>
            <div class="col-switchable d-flex flex-row">
              <div class="col-trig d-flex flex-column flex-shrink-0">
                <div class="btn-row d-flex">
                  <button name="sin" type="button" class="btn btn-light">$\\sin$</button
                  ><button name="cos" type="button" class="btn btn-light">$\\cos$</button
                  ><button name="tan" type="button" class="btn btn-light">$\\tan$</button>
                </div>
                <div class="btn-row d-flex">
                  <button name="sin-1" type="button" class="btn btn-light">$\\sin^{-1}$</button
                  ><button name="cos-1" type="button" class="btn btn-light">$\\cos^{-1}$</button
                  ><button name="tan-1" type="button" class="btn btn-light">$\\tan^{-1}$</button>
                </div>
                <div class="btn-row d-flex">
                  <button name="sinh" type="button" class="btn btn-light">$\\sinh$</button
                  ><button name="cosh" type="button" class="btn btn-light">$\\cosh$</button
                  ><button name="tanh" type="button" class="btn btn-light">$\\tanh$</button>
                </div>
                <div class="btn-row d-flex">
                  <button name="sinh-1" type="button" class="btn btn-light">$\\sinh^{-1}$</button
                  ><button name="cosh-1" type="button" class="btn btn-light">$\\cosh^{-1}$</button
                  ><button name="tanh-1" type="button" class="btn btn-light">$\\tanh^{-1}$</button>
                </div>
              </div>
              <div class="col-math d-flex flex-column flex-shrink-0">
                <div class="btn-row d-flex">
                  <button name="apowerb" type="button" class="btn btn-light">$a^b$</button
                  ><button name="sqrt" type="button" class="btn btn-light">$\\sqrt{a}$</button
                  ><button name="root" type="button" class="btn btn-light">$\\sqrt[b]{a}$</button>
                </div>
                <div class="btn-row d-flex">
                  <button name="epowerx" type="button" class="btn btn-light">$e^x$</button
                  ><button name="abs" type="button" class="btn btn-light">
                    $\\left| a \\right|$</button
                  ><button name="inv" type="button" class="btn btn-light">$\\frac{1}{x}$</button>
                </div>
                <div class="btn-row d-flex">
                  <button name="log" type="button" class="btn btn-light">$\\log_{a}{b}$</button
                  ><button name="lg" type="button" class="btn btn-light">$\\log_{10}$</button
                  ><button name="ln" type="button" class="btn btn-light">$\\ln$</button>
                </div>
                <div class="btn-row d-flex">
                  <button name="factorial" type="button" class="btn btn-light">$!$</button
                  ><button name="pi" type="button" class="btn btn-light">$\\pi$</button
                  ><button name="ans" type="button" class="btn btn-light">ans</button>
                </div>
              </div>
            </div>
            <button
              type="button"
              class="col-nav col-nav-right flex-shrink-0 align-items-center justify-content-center"
              aria-label="Scroll right"
            >
              <i class="bi bi-chevron-right"></i>
            </button>
            <div class="col-action d-flex flex-column flex-shrink-0">
              <div class="btn-row d-flex">
                <button name="backspace" type="button" class="btn btn-light" aria-label="Backspace">
                  <i class="bi bi-backspace"></i>
                </button>
              </div>
              <div class="btn-row d-flex">
                <button
                  name="calculate"
                  type="button"
                  class="btn btn-success"
                  aria-label="Calculate"
                >
                  <i class="bi bi-arrow-return-left"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}
