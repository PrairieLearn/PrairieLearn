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

    // render sticky on window scroll or resize
    const resizeEvent = Utils.getEventName('resize.sticky-header-table', this.$el.attr('id'));
    const scrollEvent = Utils.getEventName('scroll.sticky-header-table', this.$el.attr('id'));

    // let firstScrollableAncestor = $tableBody.parentElement;
    // while (parent) {
    //   const style = window.getComputedStyle(parent);
    //   // Check if any of the overflow properties are set to 'auto' or 'scroll'
    //   if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
    //     return parent;
    //   }
    //   firstScrollableAncestor = parent.parentElement;
    // }

    $(window)
      .off(resizeEvent)
      .on(resizeEvent, () => this.renderStickyHeader());
    $(window)
      .off(scrollEvent)
      .on(scrollEvent, () => this.renderStickyHeader());
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

    let $overflowAutoAncestor = this.$tableBody
      .parents()
      .filter(function () {
        return $(this).css('overflow') === 'auto' || $(this).css('overflow-y') === 'auto';
      })
      .first();

    if (!$overflowAutoAncestor) {
      $overflowAutoAncestor = window;
    }

    console.log('overflowAutoAncestor', $overflowAutoAncestor);

    // let i = 0;
    // while (firstScrollableAncestor) {
    //   //   const style = window.getComputedStyle(firstScrollableAncestor);
    //   //   // Check if any of the overflow properties are set to 'auto' or 'scroll'
    //   //   console.log('Style', style.overflow, firstScrollableAncestor);
    //   //   if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
    //   //     break;
    //   //   }
    //   firstScrollableAncestor = firstScrollableAncestor.parent();
    //   console.log('firstScrollableAncestor (found)', firstScrollableAncestor);
    //   i++;
    //   if (i < 100) {
    //     break;
    //   }
    // }

    // console.log('firstScrollableAncestor (found)', firstScrollableAncestor);

    const top = $overflowAutoAncestor.scrollTop();
    console.log('top', top);
    const offsetTop = $overflowAutoAncestor.offset().top;
    console.log('offset top', offsetTop);

    // top anchor scroll position, minus header height and overflow auto ancestor top
    const start = this.$stickyBegin.offset().top - offsetTop - this.options.stickyHeaderOffsetY;
    console.log('start', start);

    // bottom anchor scroll position, minus header height, minus sticky height
    const end =
      this.$stickyEnd.offset().top -
      offsetTop -
      this.options.stickyHeaderOffsetY -
      this.$header.height();

    console.log('end', end);

    // show sticky when top anchor touches header, and when bottom anchor not exceeded
    if (top > start && top <= end) {
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
