define(['underscore', 'backbone', 'PrairieDraw'], function (_, Backbone, PrairieDraw) {
  var SimpleFigureView = Backbone.View.extend({
    initialize: function () {
      this.params = this.options.params;
      this.submittedAnswer = this.options.submittedAnswer;
      this.trueAnswer = this.options.trueAnswer;
      this.pd = new PrairieDraw.PrairieDraw(this.el);
      _.extend(this.pd, Backbone.Events);
      this.pd.on('imgLoad', this.render, this);
      this.listenTo(this.model, 'change', this.render);
      this.listenTo(this.params, 'change', this.render);
      this.listenTo(this.submittedAnswer, 'change', this.render);
      this.listenTo(this.trueAnswer, 'change', this.render);
      var that = this;
      this.pd.registerMouseLineDrawCallback(function () {
        that.trigger('mouseLineDraw', this.mouseLineDrawStart, this.mouseLineDrawEnd);
      });
      this.pd.registerRedrawCallback(function () {
        that.render();
      });
    },

    render: function () {
      return this;
    },

    activateMouseLineDraw: function () {
      this.pd.activateMouseLineDraw();
    },

    activate3DControl: function () {
      this.pd.activate3DControl();
    },
  });

  var addFigure = function (client, el, drawFcn) {
    var FigureView = SimpleFigureView.extend({
      render: drawFcn,
    });
    var figureView = new FigureView({
      el: el,
      model: client.model,
      params: client.params,
      submittedAnswer: client.submittedAnswer,
      trueAnswer: client.trueAnswer,
    });
    figureView.render();
    return figureView;
  };

  return {
    SimpleFigureView: SimpleFigureView,
    addFigure: addFigure,
  };
});
