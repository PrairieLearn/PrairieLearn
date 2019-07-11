/* eslint-disable */
(function(){
  window.GraphvizRender = function(options) {
    var elementId = '#graphviz-render-' + options.uuid;
    var container = document.querySelector(elementId);

    var viz = new Viz({
      workerURL: options.workerURL,
    });

    viz.renderSVGElement(options.data, { engine: options.engine })
      .then(function(element) {
        container.innerHTML = '';
        container.appendChild(element);
      })
      .catch(function(error) {
        // Show the error to the user
        container.innerHTML = '<span style="color: red">' + error + '</span>';
        container.innerHTML += '<pre><code>' + options.data + '</code></pre>'

        // Possibly display the error
        console.error(error);
      });
  }
})()

