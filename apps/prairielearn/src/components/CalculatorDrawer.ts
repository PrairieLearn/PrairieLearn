import { type HtmlSafeString, html } from '@prairielearn/html';

import { compiledScriptTag, compiledStylesheetTag } from '../lib/assets.js';

export function CalculatorDrawerHeadScripts(): HtmlSafeString {
  return html`
    ${compiledScriptTag('calculatorClient.js')} ${compiledStylesheetTag('calculator.css')}
  `;
}

export function CalculatorDrawerToggle(): HtmlSafeString {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-secondary text-white">Tools</div>
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
    <button type="button" class="calculator-fab" id="calculatorFab" aria-label="Open calculator">
      <i class="bi bi-calculator"></i>
      <span> Calculator </span>
      <i class="bi bi-chevron-up"></i>
      <span class="calculator-fab-close" id="calculatorFabClose" aria-label="Dismiss calculator">
        <i class="bi bi-x-lg"></i>
      </span>
    </button>
    <div class="calculator-drawer" id="calculatorDrawer" data-storage-key="${storageKey}">
      <div class="calculator-resize-handle" id="calculatorResizeHandle"></div>
      <div class="calculator-drawer-header">
        <span class="calculator-drawer-title"> <i class="bi bi-calculator"></i> Calculator </span>
        <button
          type="button"
          class="btn btn-sm btn-outline-light"
          id="calculatorDrawerClose"
          aria-label="Close calculator"
        >
          <i class="bi bi-chevron-down"></i>
        </button>
      </div>
      <div class="calculator-drawer-body">
        <div id="history-panel" class="history-panel"></div>

        <template id="history-item-template">
          <div class="history-item">
            <div class="history-content">
              <div class="history-row history-input">
                <math-field class="history-text" contenteditable="false"></math-field>
                <div class="form-check form-switch history-mode-switch" title="Toggle deg/rad">
                  <span class="toggle-label">rad</span>
                  <input class="form-check-input" type="checkbox" role="switch" />
                  <span class="toggle-label">deg</span>
                </div>
                <button
                  type="button"
                  class="calculator-action-btn history-copy-btn"
                  title="Copy to clipboard"
                >
                  <i class="fa-solid fa-copy"></i>
                </button>
                <button
                  type="button"
                  class="calculator-action-btn history-insert-btn"
                  title="Insert into input"
                >
                  <i class="fa-solid fa-arrow-down"></i>
                </button>
              </div>
              <div class="history-row history-output">
                <math-field class="history-text" contenteditable="false"></math-field>
                <button
                  type="button"
                  class="calculator-action-btn history-copy-btn"
                  title="Copy to clipboard"
                >
                  <i class="fa-solid fa-copy"></i>
                </button>
                <button
                  type="button"
                  class="calculator-action-btn history-insert-btn"
                  title="Insert into input"
                >
                  <i class="fa-solid fa-arrow-down"></i>
                </button>
              </div>
            </div>
          </div>
        </template>

        <div class="input-container">
          <math-field
            id="calculator-input"
            class="pl-calculator-input"
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
            data-bs-placement="right"
            data-bs-delay="300"
            data-bs-title="Clear input"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="calculator-output-panel" class="output-panel">
          <math-field
            id="calculator-output"
            class="pl-calculator-output"
            contenteditable="false"
            placeholder="\\mathrm{Output\\ will\\ be\\ displayed\\ here}"
          >
          </math-field>
          <button
            id="calculator-output-copy"
            type="button"
            class="calculator-action-btn"
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-delay="300"
            data-bs-title="Copy this output"
          >
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>

        <div class="calculator-main bg-body-secondary p-2">
          <div class="calculator-controls">
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
                autocomplete="off"
                onclick="showPanel('main')"
                checked
              />
              <label class="btn btn-outline-secondary" for="main-btn">main</label>

              <input
                type="radio"
                class="btn-check"
                name="btnradio"
                id="abc-btn"
                autocomplete="off"
                onclick="showPanel('abc')"
              />
              <label class="btn btn-outline-secondary" for="abc-btn">abc</label>

              <input
                type="radio"
                class="btn-check"
                name="btnradio"
                id="func-btn"
                autocomplete="off"
                onclick="showPanel('func')"
              />
              <label class="btn btn-outline-secondary" for="func-btn">func</label>
            </div>

            <div class="calculator-toggles">
              <div
                class="form-check form-switch d-flex align-items-center"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                title="decimal or fractional"
              >
                <span class="toggle-label">dec</span>
                <input class="form-check-input mx-1" type="checkbox" id="displayModeSwitch" />
                <span class="toggle-label">frac</span>
              </div>

              <div
                class="form-check form-switch d-flex align-items-center"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                title="radian or degree"
              >
                <span class="toggle-label">rad</span>
                <input class="form-check-input mx-1" type="checkbox" id="angleModeSwitch" />
                <span class="toggle-label">deg</span>
              </div>
            </div>
          </div>

          <div id="main-keyboard" class="keyboard main">
            <button type="button" class="col-nav col-nav-left">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="col-functions d-flex flex-column">
              <div class="d-flex">
                <button name="sqr" type="button" class="btn btn-light">$a^2$</button
                ><button name="apowerb" type="button" class="btn btn-light">$a^b$</button
                ><button name="epowerx" type="button" class="btn btn-light">$e^x$</button
                ><button name="ln" type="button" class="btn btn-light">$\\ln$</button>
              </div>
              <div class="d-flex">
                <button name="sqrt" type="button" class="btn btn-light">$\\sqrt{a}$</button
                ><button name="root" type="button" class="btn btn-light">$\\sqrt[b]{a}$</button
                ><button name="abs" type="button" class="btn btn-light">$\\left| a \\right|$</button
                ><button name="log" type="button" class="btn btn-light">$\\log_{a}{b}$</button>
              </div>
              <div class="d-flex">
                <button name="sin" type="button" class="btn btn-light">$\\sin$</button
                ><button name="cos" type="button" class="btn btn-light">$\\cos$</button
                ><button name="tan" type="button" class="btn btn-light">$\\tan$</button
                ><button name="lg" type="button" class="btn btn-light">$\\log_{10}$</button>
              </div>
              <div class="d-flex">
                <button name="sin-1" type="button" class="btn btn-light">$\\sin^{-1}$</button
                ><button name="cos-1" type="button" class="btn btn-light">$\\cos^{-1}$</button
                ><button name="tan-1" type="button" class="btn btn-light">$\\tan^{-1}$</button
                ><button name="pi" type="button" class="btn btn-light">$\\pi$</button>
              </div>
            </div>
            <div class="col-numbers d-flex flex-column">
              <div class="d-flex">
                <button id="7" type="button" class="btn btn-secondary">7</button
                ><button id="8" type="button" class="btn btn-secondary">8</button
                ><button id="9" type="button" class="btn btn-secondary">9</button
                ><button name="div" type="button" class="btn btn-light">$\\div$</button>
              </div>
              <div class="d-flex">
                <button id="4" type="button" class="btn btn-secondary">4</button
                ><button id="5" type="button" class="btn btn-secondary">5</button
                ><button id="6" type="button" class="btn btn-secondary">6</button
                ><button name="mul" type="button" class="btn btn-light">$\\times$</button>
              </div>
              <div class="d-flex">
                <button id="1" type="button" class="btn btn-secondary">1</button
                ><button id="2" type="button" class="btn btn-secondary">2</button
                ><button id="3" type="button" class="btn btn-secondary">3</button
                ><button name="minus" type="button" class="btn btn-light">$-$</button>
              </div>
              <div class="d-flex">
                <button id="0" type="button" class="btn btn-secondary">0</button
                ><button name="dec-point" type="button" class="btn btn-secondary">.</button
                ><button name="ans" type="button" class="btn btn-light">ans</button
                ><button name="plus" type="button" class="btn btn-light">$+$</button>
              </div>
            </div>
            <button type="button" class="col-nav col-nav-right">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <div class="col-extras d-flex flex-column">
              <div class="d-flex">
                <button name="perc" type="button" class="btn btn-light">%</button
                ><button name="frac" type="button" class="btn btn-light">$\\frac{a}{b}$</button>
              </div>
              <div class="d-flex">
                <button name="lpar" type="button" class="btn btn-light">(</button
                ><button name="rpar" type="button" class="btn btn-light">)</button>
              </div>
              <div class="d-flex">
                <button name="left" type="button" class="btn btn-light">
                  <i class="fa-solid fa-left-long"></i></button
                ><button name="right" type="button" class="btn btn-light">
                  <i class="fa-solid fa-right-long"></i>
                </button>
              </div>
              <div class="d-flex">
                <button name="backspace" type="button" class="btn btn-light">
                  <i class="fa-solid fa-delete-left"></i></button
                ><button name="calculate" type="button" class="btn btn-success">
                  <i class="bi bi-arrow-return-left"></i>
                </button>
              </div>
            </div>
          </div>

          <div id="abc-keyboard" class="keyboard abc">
            <div id="abc-row-1" class="d-flex justify-content-center">
              <button id="q" type="button" class="btn btn-light">q</button>
              <button id="w" type="button" class="btn btn-light">w</button>
              <button id="e" type="button" class="btn btn-light">e</button>
              <button id="r" type="button" class="btn btn-light">r</button>
              <button id="t" type="button" class="btn btn-light">t</button>
              <button id="y" type="button" class="btn btn-light">y</button>
              <button id="u" type="button" class="btn btn-light">u</button>
              <button id="i" type="button" class="btn btn-light">i</button>
              <button id="o" type="button" class="btn btn-light">o</button>
              <button id="p" type="button" class="btn btn-light">p</button>
            </div>
            <div id="abc-row-2" class="d-flex justify-content-center">
              <button id="a" type="button" class="btn btn-light">a</button>
              <button id="s" type="button" class="btn btn-light">s</button>
              <button id="d" type="button" class="btn btn-light">d</button>
              <button id="f" type="button" class="btn btn-light">f</button>
              <button id="g" type="button" class="btn btn-light">g</button>
              <button id="h" type="button" class="btn btn-light">h</button>
              <button id="j" type="button" class="btn btn-light">j</button>
              <button id="k" type="button" class="btn btn-light">k</button>
              <button id="l" type="button" class="btn btn-light">l</button>
            </div>
            <div id="abc-row-3" class="d-flex justify-content-center">
              <button name="eq" type="button" class="btn btn-light">=</button>
              <button id="z" type="button" class="btn btn-light">z</button>
              <button id="x" type="button" class="btn btn-light">x</button>
              <button id="c" type="button" class="btn btn-light">c</button>
              <button id="v" type="button" class="btn btn-light">v</button>
              <button id="b" type="button" class="btn btn-light">b</button>
              <button id="n" type="button" class="btn btn-light">n</button>
              <button id="m" type="button" class="btn btn-light">m</button>
              <button name="assign" type="button" class="btn btn-light">$:=$</button>
              <button name="backspace" type="button" class="btn btn-light">
                <i class="fa-solid fa-delete-left"></i>
              </button>
            </div>
            <div id="abc-row-4" class="d-flex justify-content-center">
              <button name="shift" type="button" class="btn btn-light btn-wide">
                <i class="fa-solid fa-arrow-up"></i>
              </button>
              <button name="lpar" type="button" class="btn btn-light">(</button>
              <button name="rpar" type="button" class="btn btn-light">)</button>
              <button name="lbra" type="button" class="btn btn-light">[</button>
              <button name="rbra" type="button" class="btn btn-light">]</button>
              <button name="factorial" type="button" class="btn btn-light">$!$</button>
              <button name="pi" type="button" class="btn btn-light">$\\pi$</button>
              <button name="left" type="button" class="btn btn-light">
                <i class="fa-solid fa-left-long"></i>
              </button>
              <button name="right" type="button" class="btn btn-light">
                <i class="fa-solid fa-right-long"></i>
              </button>
              <button name="calculate" type="button" class="btn btn-success btn-wide">
                <i class="bi bi-arrow-return-left"></i>
              </button>
            </div>
          </div>

          <div id="func-keyboard" class="keyboard func">
            <button type="button" class="col-nav col-nav-left">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="col-switchable">
              <div class="col-trig d-flex flex-column">
                <div class="d-flex">
                  <button name="sin" type="button" class="btn btn-light">$\\sin$</button
                  ><button name="cos" type="button" class="btn btn-light">$\\cos$</button
                  ><button name="tan" type="button" class="btn btn-light">$\\tan$</button>
                </div>
                <div class="d-flex">
                  <button name="sin-1" type="button" class="btn btn-light">$\\sin^{-1}$</button
                  ><button name="cos-1" type="button" class="btn btn-light">$\\cos^{-1}$</button
                  ><button name="tan-1" type="button" class="btn btn-light">$\\tan^{-1}$</button>
                </div>
                <div class="d-flex">
                  <button name="sinh" type="button" class="btn btn-light">$\\sinh$</button
                  ><button name="cosh" type="button" class="btn btn-light">$\\cosh$</button
                  ><button name="tanh" type="button" class="btn btn-light">$\\tanh$</button>
                </div>
                <div class="d-flex">
                  <button name="sinh-1" type="button" class="btn btn-light">$\\sinh^{-1}$</button
                  ><button name="cosh-1" type="button" class="btn btn-light">$\\cosh^{-1}$</button
                  ><button name="tanh-1" type="button" class="btn btn-light">$\\tanh^{-1}$</button>
                </div>
              </div>
              <div class="col-math d-flex flex-column">
                <div class="d-flex">
                  <button name="apowerb" type="button" class="btn btn-light">$a^b$</button
                  ><button name="sqrt" type="button" class="btn btn-light">$\\sqrt{a}$</button
                  ><button name="root" type="button" class="btn btn-light">$\\sqrt[b]{a}$</button>
                </div>
                <div class="d-flex">
                  <button name="epowerx" type="button" class="btn btn-light">$e^x$</button
                  ><button name="abs" type="button" class="btn btn-light">
                    $\\left| a \\right|$</button
                  ><button name="inv" type="button" class="btn btn-light">$\\frac{1}{x}$</button>
                </div>
                <div class="d-flex">
                  <button name="log" type="button" class="btn btn-light">$\\log_{a}{b}$</button
                  ><button name="lg" type="button" class="btn btn-light">$\\log_{10}$</button
                  ><button name="ln" type="button" class="btn btn-light">$\\ln$</button>
                </div>
                <div class="d-flex">
                  <button name="factorial" type="button" class="btn btn-light">$!$</button
                  ><button name="pi" type="button" class="btn btn-light">$\\pi$</button
                  ><button name="ans" type="button" class="btn btn-light">ans</button>
                </div>
              </div>
            </div>
            <button type="button" class="col-nav col-nav-right">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <div class="col-action d-flex flex-column">
              <div class="d-flex">
                <button name="backspace" type="button" class="btn btn-light">
                  <i class="fa-solid fa-delete-left"></i>
                </button>
              </div>
              <div class="d-flex">
                <button name="calculate" type="button" class="btn btn-success">
                  <i class="bi bi-arrow-return-left"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
