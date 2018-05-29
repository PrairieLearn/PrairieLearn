const parse5 = require('parse5');

const knownElements = [
  'pl_question_panel',
  'pl_figure',
  'pl_checkbox',
  'pl_multiple_choice',
  'pl_number_input',
];

const doc = `<pl_question_panel>
  <p>
    An object's motion is described by the position-time graph below.
  </p>

  <pl_figure file_name="graph.png"></pl_figure>
</pl_question_panel>

<pl_question_panel><hr></pl_question_panel>

<p>
  1. <pl_question_panel>Select all regions where the object's velocity is primarily positive.</pl_question_panel>
  <pl_checkbox answers_name="vpos" weight="1" inline="true">
    <pl_answer correct="true">A-B</pl_answer>
    <pl_answer correct="true">B-C</pl_answer>
    <pl_answer>               C-D</pl_answer>
    <pl_answer correct="true">D-E</pl_answer>
    <pl_answer>               E-F</pl_answer>
    <pl_answer>               F-G</pl_answer>
  </pl_checkbox>
</p>

<pl_question_panel><hr></pl_question_panel>

<p>
  2. <pl_question_panel>At point <b>E</b>, the object's acceleration is:</pl_question_panel>
  <pl_multiple_choice answers_name="acc" weight="1" inline="true">
    <pl_answer correct="false">positive</pl_answer>
    <pl_answer correct="true">negative</pl_answer>
    <pl_answer correct="false">zero</pl_answer>
  </pl_multiple_choice>
</p>

<pl_question_panel><hr></pl_question_panel>

<p>
  3. <pl_question_panel>At point <b>F</b>, the object is:</pl_question_panel>
  <pl_multiple_choice answers_name="speed_change" weight="1">
    <pl_answer correct="true">speeding “up”</pl_answer>
    <pl_answer correct="false">slowing down</pl_answer>
    <pl_answer correct="false">neither speeding up nor slowing down</pl_answer>
  </pl_multiple_choice>
</p>

<pl_question_panel><hr></pl_question_panel>

<p>
  4. <pl_question_panel>What is the average velocity of the object during the time interval from $t = 0\\rm\\ s$ to $t = 5\\rm\\ s$?</pl_question_panel>
<pl_number_input answers_name="v_avg" label="$v_{\\rm avg} = $" suffix="$\\rm\\ m/s$" correct_answer="0.8" comparison="sigfig" digits="2" weight="1"></pl_number_input>
</p>

<pl_question_panel><hr></pl_question_panel>

<p>
  5. <pl_question_panel>How do the velocities of the object at points <b>B</b> and <b>C</b> compare?</pl_question_panel>
  <pl_multiple_choice answers_name="v_comp" weight="1" inline="true">
    <pl_answer correct="true">$v(B) > v(C)$</pl_answer>
    <pl_answer correct="false">$v(B) = v(C)$</pl_answer>
    <pl_answer correct="false">$v(B) < v(C)$</pl_answer>
  </pl_multiple_choice>
</p>`;

console.log('EMPTY:');
console.log(parse5.parseFragment(''));

const fragment = parse5.parseFragment(doc);

const renderNode = (node) => {
  if (node.tagName === 'pl_question_panel') return '';
  node.nodeName += '_VISITED';
  node.tagName += '_VISITED';
  const ser = parse5.serialize({
    childNodes: [node],
  });
  return ser;
};

const transformNode = (node, indent) => {
  if (node.tagName && knownElements.includes(node.tagName)) {
    const renderedNode = parse5.parseFragment(renderNode(node));
    if (renderedNode.childNodes.length === 0) {
      return renderNode;
    }
    node = renderedNode.childNodes[0];
  }
  //console.log(`${' '.repeat(indent)}${node.nodeName}`);
  for (let i = 0; i < (node.childNodes || []).length; i++) {
    node.childNodes[i] = transformNode(node.childNodes[i], indent + 2);
  }
  return node;
};

const transformed = transformNode(fragment, 0);
console.log(parse5.serialize(transformed));
