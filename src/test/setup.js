import '@testing-library/jest-dom/vitest'

// jsdom has no IntersectionObserver; Framer Motion's whileInView (used by Reveal.jsx) needs one.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = IntersectionObserverStub
global.IntersectionObserver = IntersectionObserverStub
