'use strict';

const HIDDEN_LEARNING_CONTENT_STATUSES = new Set(['مسودة', 'مخفي', 'draft', 'hidden']);

function reusableLearningContentIsVisible(item = {}) {
  const status = String(item.status || '').trim().toLowerCase();
  return item.archived !== true
    && item.active !== false
    && item.published !== false
    && !HIDDEN_LEARNING_CONTENT_STATUSES.has(status);
}

module.exports = { reusableLearningContentIsVisible };
