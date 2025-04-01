// Modified version of bootstrap-table-sticky-header.js in bootstrap-table
// Link: https://github.com/wenzhixin/bootstrap-table/blob/f34204b3036e80c3545408d75930c955448c4fe5/src/extensions/sticky-header/bootstrap-table-sticky-header.js
//
// This version makes the sticky header aware of non-window scrolling containers, necessary for
// the side nav component when enhanced navigation is enabled.

/**
 * (The MIT License)
 *
 * Copyright (c) 2012-2019 Zhixin Wen <wenzhixin2010@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const Utils = $.fn.bootstrapTable.utils;

Object.assign($.fn.bootstrapTable.defaults, {
  stickyHeader: false,
  stickyHeaderOffsetY: 0,
  stickyHeaderOffsetLeft: 0,
  stickyHeaderOffsetRight: 0,
});

$.BootstrapTable = class extends $.BootstrapTable {
  initHeader(...args) {
    super.initHeader(...args);
    if (!this.options.stickyHeader) {
      return;
    }

    this.$tableBody
      .find('.sticky-header-container,.sticky_anchor_begin,.sticky_anchor_end')
      .remove();

    this.$el.before('<div class="sticky-header-container"></div>');
    this.$el.before('<div class="sticky_anchor_begin"></div>');
    this.$el.after('<div class="sticky_anchor_end"></div>');
    this.$header.addClass('sticky-header');

    // clone header just once, to be used as sticky header
    // deep clone header, using source header affects tbody>td width
    this.$stickyContainer = this.$tableBody.find('.sticky-header-container');
    this.$stickyBegin = this.$tableBody.find('.sticky_anchor_begin');
    this.$stickyEnd = this.$tableBody.find('.sticky_anchor_end');
    this.$stickyHeader = this.$header.clone(true, true);

    this.$nonBodyScrollableAncestor = this.$tableBody
      .parents()
      .filter(function () {
        return (
          ($(this).css('overflow') === 'auto' || $(this).css('overflow-y') === 'auto') &&
          !$(this).is('body')
          // Exclude the body tag, since we will handle scrolling differently if
          // the body is the scrollable ancestor.
        );
      })
      .first();

    const resizeEvent = Utils.getEventName('resize.sticky-header-table', this.$el.attr('id'));
    const scrollEvent = Utils.getEventName('scroll.sticky-header-table', this.$el.attr('id'));

    if (this.$nonBodyScrollableAncestor.length === 0) {
      // Handle resize and scroll events based on the window
      $(window)
        .off(resizeEvent)
        .on(resizeEvent, () => this.renderStickyHeader());
      $(window)
        .off(scrollEvent)
        .on(scrollEvent, () => this.renderStickyHeader());
    } else {
      // Handle resize and scroll events based on the scrollable ancestor
      this.$nonBodyScrollableAncestor
        .off(resizeEvent)
        .on(resizeEvent, () => this.renderStickyHeader());
      this.$nonBodyScrollableAncestor.off().on(scrollEvent, () => this.renderStickyHeader());
    }
    this.$tableBody.off('scroll').on('scroll', () => this.matchPositionX());
  }

  onColumnSearch({ currentTarget, keyCode }) {
    super.onColumnSearch({ currentTarget, keyCode });
    if (!this.options.stickyHeader) {
      return;
    }

    this.renderStickyHeader();
  }

  resetView(...args) {
    super.resetView(...args);
    if (!this.options.stickyHeader) {
      return;
    }

    $('.bootstrap-table.fullscreen')
      .off('scroll')
      .on('scroll', () => this.renderStickyHeader());
  }

  getCaret(...args) {
    super.getCaret(...args);
    if (!this.options.stickyHeader) {
      return;
    }

    if (this.$stickyHeader) {
      const $ths = this.$stickyHeader.find('th');

      this.$header.find('th').each((i, th) => {
        $ths.eq(i).find('.sortable').attr('class', $(th).find('.sortable').attr('class'));
      });
    }
  }

  horizontalScroll() {
    super.horizontalScroll();
    if (!this.options.stickyHeader) {
      return;
    }

    this.$tableBody.on('scroll', () => this.matchPositionX());
  }

  renderStickyHeader() {
    // Declaration of that is intentional, as this is legacy, 3rd-party jQuery code.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    this.$stickyHeader = this.$header.clone(true, true);

    if (this.options.filterControl) {
      $(this.$stickyHeader)
        .off('keyup change mouseup')
        .on('keyup change mouse', function (e) {
          const $target = $(e.target);
          const value = $target.val();
          const field = $target.parents('th').data('field');
          const $coreTh = that.$header.find(`th[data-field="${field}"]`);

          if ($target.is('input')) {
            $coreTh.find('input').val(value);
          } else if ($target.is('select')) {
            const $select = $coreTh.find('select');

            $select.find('option[selected]').removeAttr('selected');
            $select.find(`option[value="${value}"]`).attr('selected', true);
          }

          that.triggerSearch();
        });
    }

    // Amount of pixels scrolled down from the top edge of the scrollable container
    let scrollTop;

    // Distance from top of the scrollable container to the top of the document
    let offsetTop;

    // Distance from the top of the document to the top of the sticky header
    let stickyBegin;

    // Distance from the top of the document to the bottom of the sticky header
    let stickyEnd;

    if (this.$nonBodyScrollableAncestor.length === 0) {
      scrollTop = $(window).scrollTop();

      // The window’s top is aligned with the document’s top.
      offsetTop = 0;

      stickyBegin = this.$stickyBegin.offset().top - this.options.stickyHeaderOffsetY;
      stickyEnd = this.$stickyEnd.offset().top - this.options.stickyHeaderOffsetY;
    } else {
      scrollTop = this.$nonBodyScrollableAncestor.scrollTop();

      // Distance from the top of the scrollable container to the top of the document
      offsetTop = this.$nonBodyScrollableAncestor.offset().top;

      stickyBegin = this.$stickyBegin.offset().top + scrollTop - this.options.stickyHeaderOffsetY;
      stickyEnd = this.$stickyEnd.offset().top + scrollTop - this.options.stickyHeaderOffsetY;
    }

    // Show sticky when top anchor touches header, and when bottom anchor not exceeded

    // Add offsetTop to scrollTop to account for the distance from the top of the
    // scrollable container to the top of the document.

    if (scrollTop + offsetTop > stickyBegin && scrollTop <= stickyEnd) {
      // ensure clone and source column widths are the same
      this.$stickyHeader.find('tr').each((indexRows, rows) => {
        $(rows)
          .find('th')
          .each((index, el) => {
            $(el).css(
              'min-width',
              this.$header.find(`tr:eq(${indexRows})`).find(`th:eq(${index})`).css('width'),
            );
          });
      });
      // match bootstrap table style
      this.$stickyContainer.show().addClass('fix-sticky fixed-table-container');
      // stick it in position
      const coords = this.$tableBody[0].getBoundingClientRect();
      let width = '100%';
      let stickyHeaderOffsetLeft = this.options.stickyHeaderOffsetLeft;
      let stickyHeaderOffsetRight = this.options.stickyHeaderOffsetRight;

      if (!stickyHeaderOffsetLeft) {
        stickyHeaderOffsetLeft = coords.left;
      }
      if (!stickyHeaderOffsetRight) {
        width = `${coords.width}px`;
      }
      if (this.$el.closest('.bootstrap-table').hasClass('fullscreen')) {
        stickyHeaderOffsetLeft = 0;
        stickyHeaderOffsetRight = 0;
        width = '100%';
      }

      this.$stickyContainer.css('top', `${this.options.stickyHeaderOffsetY + offsetTop}px`);
      this.$stickyContainer.css('left', `${stickyHeaderOffsetLeft}px`);
      this.$stickyContainer.css('right', `${stickyHeaderOffsetRight}px`);
      this.$stickyContainer.css('width', `${width}`);
      // create scrollable container for header
      this.$stickyTable = $('<table/>');
      this.$stickyTable.addClass(this.options.classes);
      // append cloned header to dom
      this.$stickyContainer.html(this.$stickyTable.append(this.$stickyHeader));
      // match clone and source header positions when left-right scroll
      this.matchPositionX();
    } else {
      this.$stickyContainer.removeClass('fix-sticky').hide();
    }
  }

  matchPositionX() {
    this.$stickyContainer.scrollLeft(this.$tableBody.scrollLeft());
  }
};
