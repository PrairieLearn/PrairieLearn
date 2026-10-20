function populateMatrixInputs() {
  const initialValues = {
    matrix_grid1: '1\u200b',
    matrix_grid2: 'café',
    matrix_grid3: '',
    matrix_grid4: '4',
  };

  for (const [name, value] of Object.entries(initialValues)) {
    const input = document.querySelector(`input[name="${CSS.escape(name)}"]`);
    if (input instanceof HTMLInputElement && input.value === '') {
      input.value = value;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateMatrixInputs);
} else {
  populateMatrixInputs();
}
