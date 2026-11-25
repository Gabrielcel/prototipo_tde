// Registro central de ações. Um único ponto de entrada de eventos evita ações duplicadas.
const clickHandlers = new Map();
const formHandlers = new Map();
const inputHandlers = new Map();
const changeHandlers = new Map();

export const registerActions = (handlers) =>
    Object.entries(handlers).forEach(([name, fn]) => clickHandlers.set(name, fn));
export const registerForms = (handlers) => Object.entries(handlers).forEach(([name, fn]) => formHandlers.set(name, fn));
export const registerInputs = (handlers) =>
    Object.entries(handlers).forEach(([name, fn]) => inputHandlers.set(name, fn));
export const registerChanges = (handlers) =>
    Object.entries(handlers).forEach(([name, fn]) => changeHandlers.set(name, fn));

export const getClickHandler = (name) => clickHandlers.get(name);
export const getFormHandler = (name) => formHandlers.get(name);
export const getInputHandler = (name) => inputHandlers.get(name);
export const getChangeHandler = (name) => changeHandlers.get(name);
