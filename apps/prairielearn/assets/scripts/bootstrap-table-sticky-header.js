// Modified version of bootstrap-table-sticky-header.js in bootstrap-table
// Link: https://github.com/wenzhixin/bootstrap-table/blob/develop/src/extensions/sticky-header/bootstrap-table-sticky-header.js
//
// This version makes the sticky header aware of non-window scrolling containers, necessary for
// the side nav component when enhanced navigation is enabled.

/**
 * @author vincent loh <vincent.ml@gmail.com>
 * @update J Manuel Corona <jmcg92@gmail.com>
 * @update zhixin wen <wenzhixin2010@gmail.com>
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

    let $nonBodyScrollableAncestor = this.$tableBody
      .parents()
      .filter(function () {
        return (
          ($(this).css('overflow') === 'auto' || $(this).css('overflow-y') === 'auto') &&
          !$(this).is('body')
          // Exclude the body tag, since we will handle scrolling
          // with the whole window differently.
        );
      })
      .first();

    const resizeEvent = Utils.getEventName('resize.sticky-header-table', this.$el.attr('id'));
    const scrollEvent = Utils.getEventName('scroll.sticky-header-table', this.$el.attr('id'));

    if ($nonBodyScrollableAncestor.length === 0) {
      // Handle resize and scroll events based on the whole window
      $(window)
        .off(resizeEvent)
        .on(resizeEvent, () => this.renderStickyHeader());
      $(window)
        .off(scrollEvent)
        .on(scrollEvent, () => this.renderStickyHeader());
    } else {
      // Handle resize and scroll events based on the scrollable ancestor
      $nonBodyScrollableAncestor.off(resizeEvent).on(resizeEvent, () => this.renderStickyHeader());
      $nonBodyScrollableAncestor.off().on(scrollEvent, () => this.renderStickyHeader());
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
    this.$stickyHeader = this.$header.clone(true, true);

    if (this.options.filterControl) {
      $(this.$stickyHeader)
        .off('keyup change mouseup')
        .on('keyup change mouse', function (e) {
          const $target = $(e.target);
          const value = $target.val();
          const field = $target.parents('th').data('field');
          const $coreTh = this.$header.find(`th[data-field="${field}"]`);

          if ($target.is('input')) {
            $coreTh.find('input').val(value);
          } else if ($target.is('select')) {
            const $select = $coreTh.find('select');

            $select.find('option[selected]').removeAttr('selected');
            $select.find(`option[value="${value}"]`).attr('selected', true);
          }

          this.triggerSearch();
        });
    }

    let $nonBodyScrollableAncestor = this.$tableBody
      .parents()
      .filter(function () {
        return (
          ($(this).css('overflow') === 'auto' || $(this).css('overflow-y') === 'auto') &&
          !$(this).is('body')
          // Exclude the body tag, since we will handle scrolling
          // with the whole window differently.
        );
      })
      .first();

    // Amount of pixels scrolled down from top edge of the window/overflow container
    let scrollTop;

    // Distance from top of the window/overflow container to the top of the document
    // Zero for window, generally non-zero for overflow containers
    let offsetTop;

    // Distance from the top of the document to the top of the sticky header
    let stickyBegin;

    // Distance from the top of the document to the bottom of the sticky header
    let stickyEnd;

    if ($nonBodyScrollableAncestor.length === 0) {
      scrollTop = $(window).scrollTop();

      // Zero, since the top of the window is the top of the document
      offsetTop = 0;

      stickyBegin = this.$stickyBegin.offset().top - this.options.stickyHeaderOffsetY;
      stickyEnd = this.$stickyEnd.offset().top - this.options.stickyHeaderOffsetY;
    } else {
      scrollTop = $nonBodyScrollableAncestor.scrollTop();

      // Distance from the top of the overflow container to the top of the document
      offsetTop = $nonBodyScrollableAncestor.offset().top;

      stickyBegin = this.$stickyBegin.offset().top + scrollTop - this.options.stickyHeaderOffsetY;
      stickyEnd = this.$stickyEnd.offset().top + scrollTop - this.options.stickyHeaderOffsetY;
    }

    console.log(scrollTop, offsetTop, stickyBegin, stickyEnd);

    // Show sticky when top anchor touches header, and when bottom anchor not exceeded

    // We add offsetTop to scrollTop to account for the distance from the top of the
    // overflow container/window to the top of the document. Especially important for
    // non-window scrolling containers.
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
