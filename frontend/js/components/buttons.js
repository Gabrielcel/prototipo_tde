/** Executa uma ação assíncrona com estado de carregamento e impede cliques repetidos. */
export async function withLoading(button, task) {
    if (!button) return task();
    if (button.getAttribute('aria-busy') === 'true') return undefined;
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    try {
        return await task();
    } finally {
        button.removeAttribute('aria-busy');
        button.disabled = false;
    }
}
