import { createOptimizedPicture } from '../../scripts/lib-franklin.js';
import createTag from '../../utils/tag.js';

const CURSOR_BLINK = 580; // in milliseconds

/**
 * Debounces a function by given delay.
 * @param {Function} func - Function to debounce.
 * @param {number} delay - Delay (in milliseconds).
 * @returns {Function} Debounced function.
 */
function debounce(func, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout); // clear previous timer
    timeout = setTimeout(() => func(...args), delay); // start new timer
  };
}

/**
 * Generates a random index within a specified range, avoiding the previous index.
 * @param {number} prevIndex - Previous index (to avoid repeating).
 * @param {number} range - Upper limit of range.
 * @returns {number} New random index within range NOT equal to prevIndex.
 */
function generateIndex(prevIndex, range) {
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * range);
  } while (newIndex === prevIndex); // repeat if new index matches previous index
  return newIndex;
}

/**
 * Identifies appropriate index file path based on block config.
 * @param {HTMLAnchorElement|null} a - Anchor element from block to evaluate.
 * @returns {string} Path to index file, either extracted from block config or a fallback.
 */
function identifySource(a) {
  const fallback = '/docpages-index.json';
  if (!a) return fallback;
  const { pathname } = new URL(a.href);
  return pathname || fallback;
}

/**
 * Fetches and parses a JSON index file from a given URL.
 * @param {string} index - The URL of the index file to fetch.
 * @returns {Array} `data` array from JSON response or empty array if undefined.
 */
async function fetchSourceData(index, faq = '') {
  if (window.docs && window.docs.length > 0) return window.docs;
  try {
    const resp = await fetch(index);
    const json = await resp.json();
    // return json.data ? json.data : [];
    window.docs = json.data ? json.data : [];
    if (faq) {
      const faqResp = await fetchSourceDataHTML(faq);
      window.docs.push(...faqResp);
    }
    return window.docs;
  } catch (error) {
    return [];
  }
}

/**
 * Fetches and parses a HTML file from a given URL.
 * @param {string} index - The URL of the index file to fetch.
 * @returns {Array} `data` array from the HTML response or empty array if undefined.
 */
async function fetchSourceDataHTML(index) {
  try {
    const resp = await fetch(index);
    const html = await resp.text();
    // parse the html and return array of sections
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const sections = Array.from(doc.querySelectorAll('h3')).map(h3 => h3.parentElement) || [];
    window.docs.push(...sections);
    const image = doc.querySelector('meta[property="og:image"]')?.content || '';
    window.faqImage = image;
    return sections;
  } catch (error) {
    return [];
  }
}

/**
 * Builds search icon SVG.
 * @returns {SVGElement} SVG search icon.
 */
function buildSearchIcon() {
  // helper to create elements using the svg namespace
  const createNS = (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag);
  const svg = createNS('svg');
  ['width', 'height'].forEach((attr) => svg.setAttribute(attr, '24'));
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = createNS('path');
  path.setAttribute('d', `M14 2A8 8 0 0 0 7.4 14.5L2.4 19.4a1.5 1.5 0 0 0 2.1 2.1L9.5 
    16.6A8 8 0 1 0 14 2Zm0 14.1A6.1 6.1 0 1 1 20.1 10 6.1 6.1 0 0 1 14 16.1Z`);
  svg.appendChild(path);
  return svg;
}

/**
 * Highlights search terms within text content of specified elements.
 * @param {Array} terms - Array of terms to highlight.
 * @param {Array} elements - Array of elements to highlight within.
 */
function highlightTerms(terms, els) {
  els.forEach((el) => {
    const matches = [];
    const text = el.textContent;
    // find all matching terms and store their offsets
    terms.forEach((term) => {
      const offset = text.toLowerCase().indexOf(term);
      if (offset >= 0) matches.push({ offset, term });
    });
    // sort matches by offset to ensure proper highlighting order
    matches.sort((a, b) => a.offset - b.offset);
    let highlighted = '';
    // if no matches are found, nothing to highlight
    if (!matches.length) highlighted = text;
    else {
      highlighted = text.slice(0, matches[0].offset);
      matches.forEach((match, i) => {
        highlighted += `<mark>${text.slice(match.offset, match.offset + match.term.length)}</mark>`;
        // add highlighted text between current and next match
        if (matches.length - 1 === i) {
          highlighted += text.slice(match.offset + match.term.length);
        } else {
          highlighted += text.slice(match.offset + match.term.length, matches[i + 1].offset);
        }
      });
      el.innerHTML = highlighted;
    }
  });
}

/**
 * Builds a search result element.
 * @param {Object} match - Matching document object.
 * @param {Array} terms - Array of search terms to highlight.
 * @param {HTMLElement} container - Results container.
 */
function buildResult(match, terms) {
  // build result
  const result = createTag('a', { href: match.path });
  const image = createOptimizedPicture(match.image, null, false, [{ width: '20' }]);
  const title = createTag('p', {}, match.title);
  const desc = createTag('p', {}, match.description);
  highlightTerms(terms, [title, desc]);
  result.append(image, title, desc);
  const li = createTag('li', { class: 'doc-search-result' });
  li.append(result);
  return li;
}

/**
 * Displays a list of matched search results in the container.
 * @param {Array} matches - Array of matching document objects.
 * @param {Array} terms - Array of search terms to highlight.
 * @param {HTMLElement} container - Results container.
 */
function displayResults(matches, terms, container) {
  // reset display
  container.setAttribute('aria-hidden', false);
  container.querySelector('.doc-search-no-result').setAttribute('aria-hidden', true);
  matches.forEach((match) => {
    const li = buildResult(match, terms);
    container.append(li);
  });
}

/**
 * Displays a matched search result in the container.
 * @param {Object} match - Matching document object.
 * @param {Array} terms - Array of search terms to highlight.
 * @param {HTMLElement} container - Results container.
 */
function displayResult(match, terms, container) {
  // reset display
  container.setAttribute('aria-hidden', false);
  container.querySelector('.doc-search-no-result').setAttribute('aria-hidden', true);
  const li = buildResult(match, terms);
  container.append(li);
}

/**
 * Displays "no results" message.
 * @param {HTMLElement} container - Results container.
 */
function displayNoResults(container) {
  const noResults = container.querySelector('.doc-search-no-result');
  noResults.setAttribute('aria-hidden', false);
}

/**
 * Hides the search results container.
 * @param {HTMLElement} container - Results container.
 */
function hideResults(container) {
  container.setAttribute('aria-hidden', true);
}

function getIdFromSectionMetadata(section) {
  const sectionId = section.parentElement?.querySelector('.section-metadata div div:nth-child(2)').textContent;
  return sectionId;
}

function createSearchResultObject(doc, terms, source) {
  const id = getIdFromSectionMetadata(doc);
  return {
    title: doc.querySelector('h3')?.textContent || '',
    description: doc.querySelector('p')?.textContent || '',
    path: `/docs/faq#${id}` || '',
    image: window.faqImage || '/default-meta-image.jpg',
    content: doc.innerHTML,
    terms: terms,
    source: source,
  };
}

/**
 * Searches through documents for match based on query.
 * @param {string} query - Search query entered by user.
 * @param {Array} docs - Array of documents to search through.
 * @returns {Object} Object containing search terms and matching document (if found).
 */
function findDoc(query, docs = [], findMultiple = false) {
  if (docs.length) {
    const { indexDocs, faqDocs } = docs.reduce((acc, doc) => {
      if (doc.title) {
        acc.indexDocs.push(doc);
      } else {
        acc.faqDocs.push(doc);
      }
      return acc;
    }, { indexDocs: [], faqDocs: [] });
    // split the query into individual terms, trimming and filtering out 1-2 letter words
    const terms = query.toLowerCase().split(' ').map((e) => e.trim()).filter((e) => e.length > 2);

    // Search through faq and index docs and return both matches
    const matches = [];

    if (findMultiple) {
      // check if every search term is included in document title
      const titleMatches = indexDocs.filter((doc) => {
        const title = doc.title.toLowerCase();
        return (terms.every((term) => title.toLowerCase().includes(term)));
      });
      if (titleMatches) matches.push(...titleMatches);

      let faqQuestionMatches = faqDocs.filter((doc) => {
        const h3Elements = doc.querySelectorAll('h3');
        return Array.from(h3Elements || []).some(h3 =>
          terms.every((term) => h3.textContent.toLowerCase().includes(term))
        );
      });
      if (faqQuestionMatches) {
        faqQuestionMatches = faqQuestionMatches.map((doc) => {
          const searchResult = createSearchResultObject(doc, terms, 'faq');
          if (searchResult.title !== '') return searchResult;
        });
        matches.push(...faqQuestionMatches);
      }

      if (matches.length > 0) return { terms, match: matches };

      // check for a match in document content if no title-only match
      const contentMatches = indexDocs.filter((doc) => {
        const content = [doc.title, doc.content].join(' ').toLowerCase();
        return terms.every((term) => content.includes(term));
      });
      let faqAnswerMatches = faqDocs.filter((doc) => {
        const pElements = doc.querySelectorAll('p');
        return Array.from(pElements || []).some(p =>
          terms.every((term) => p.textContent.toLowerCase().includes(term))
        );
      });
      if (faqAnswerMatches) {
        faqAnswerMatches = faqAnswerMatches.map((doc) => {
          const searchResult = createSearchResultObject(doc, terms, 'faq');
          if (searchResult.title !== '') return searchResult;
        });
        matches.push(...faqAnswerMatches);
      }
      if (contentMatches) matches.push(...contentMatches);
    } else {
      // check if every search term is included in document title
      const titleMatch = indexDocs.find((doc) => {
        const title = doc.title.toLowerCase();
        return (terms.every((term) => title.toLowerCase().includes(term)));
      });
      if (titleMatch) matches.push(titleMatch);

      let faqQuestionMatch = faqDocs.find((doc) => {
        const h3Elements = doc.querySelectorAll('h3');
        return Array.from(h3Elements || []).some(h3 =>
          terms.every((term) => h3.textContent.toLowerCase().includes(term))
        );
      });
      if (faqQuestionMatch) {
        faqQuestionMatch = createSearchResultObject(faqQuestionMatch, terms, 'faq');
        if (faqQuestionMatch.title !== '') matches.push(faqQuestionMatch);
      }

      if (titleMatch && matches.length > 0) return { terms, match: matches };
      // check for a match in document content if no title-only match
      const contentMatch = indexDocs.find((doc) => {
        const content = [doc.title, doc.content].join(' ').toLowerCase();
        return terms.every((term) => content.includes(term));
      });
      // let faqAnswerMatch = faqDocs.find((doc) => {
      //   const pElements = doc.querySelectorAll('p');
      //   return Array.from(pElements || []).some(p =>
      //     terms.every((term) => p.textContent.toLowerCase().includes(term))
      //   );
      // });
      // if (faqAnswerMatch) {
      //   faqAnswerMatch = createSearchResultObject(faqAnswerMatch, terms, 'faq');
      //   matches.push(faqAnswerMatch);
      // }
      if (contentMatch) matches.push(contentMatch);
    }
    if (matches.length > 0) return { terms, match: matches };
  }
  return { terms: query, match: null };
}

/**
 * Responds to search queries.
 * @param {HTMLInputElement} search - Search input.
 * @param {Array} docs - Array of documents to search.
 * @param {HTMLElement} results - Results container.
 */
function searchQuery(search, docs, results, isHomepageVariant) {
  if (docs.length && search.trim()) {
    // clear previous results
    results.querySelectorAll('.doc-search-result').forEach((r) => r.remove());
    // search for matching document
    const { match, terms } = findDoc(search, docs);
    if (match) {
      const uniqueMatches = Array.isArray(match) 
        ? [...new Map(match.map(item => [item.path, item])).values()]
        : match;
        if (isHomepageVariant) {
          displayResult(uniqueMatches[0], terms, results);
        } else {
          displayResults(uniqueMatches, terms, results);
        }
      } else {
      displayNoResults(results);
    }
  } else {
    hideResults(results);
  }
}

/**
 * Checks if input's placeholder animation is active.
 * @param {HTMLInputElement} input - Input element to check.
 * @returns {boolean} Returns `true` if animation is active, otherwise `false`.
 */
function isRotating(input) {
  return input.dataset.rotate === 'true';
}

/**
 * Force stops an animation by clearing provided interval and resetting input's placeholder.
 * @param {HTMLInputElement} input - Input element to reset.
 * @param {number} interval - Interval to clear (if applicable).
 */
function forceStop(input) {
  if (input.dataset.interval) {
    const interval = parseInt(input.dataset.interval, 10);
    clearInterval(interval);
    input.removeAttribute('data-interval');
  }
}

/**
 * Manages animation interval, ensuring it stops if animation state changes.
 * @param {HTMLInputElement} input - Input element associated with animation.
 * @param {number} delay - Delay (in milliseconds) between animation steps.
 * @param {Function} cb - Callback function to execute for each animation step.
 */
function manageInterval(input, delay, cb) {
  forceStop(input);
  // create an interval to perform the animation
  const interval = setInterval(() => {
    if (!isRotating(input)) {
      forceStop(input);
      return;
    }
    cb(interval); // execute current animation step
  }, delay); // time between animation steps
  input.dataset.interval = interval;
}

/**
 * Fades out the results container.
 * @param {HTMLElement} results - Results container.
 */
function fadeOut(results) {
  results.classList.add('fadeOut');
  // wait for .fadeOut animation to complete, then remove
  setTimeout(() => {
    results.classList.remove('fadeOut');
    hideResults(results);
  }, CURSOR_BLINK); // match timing set in .fadeOut
}

/**
 * Simulates blinking cursor in placeholder of an input element.
 * @param {HTMLInputElement} input - Input element.
 * @param {Function} cb - Callback function to execute after blinking finishes.
 * @param {number} maxBlinks - Number of blinks to perform.
 */
function blink(input, cb, maxBlinks = 5) {
  let blinks = 0;
  manageInterval(input, CURSOR_BLINK, () => {
    input.placeholder = blinks % 2
      ? `${input.placeholder.slice(0, input.placeholder.length - 1)}`
      : `${input.placeholder}|`;
    blinks += 1;
    if (blinks >= maxBlinks) {
      forceStop(input); // stop blinking
      cb();
    }
  });
}

/**
 * Simulates typing placeholder then triggers a blinking cursor.
 * @param {string} placeholder - Text to simulate typing into input's placeholder.
 * @param {HTMLInputElement} input - Input element where placeholder will be updated.
 * @param {HTMLElement} results - Results container.
 * @param {Function} cb - Callback function to execute after typing and pause finish.
 * @param {boolean} isHomepageVariant - Whether the block is a homepage variant.
 */
function type(placeholder, input, results, cb, isHomepageVariant) {
  let i = 0;
  // calculate midpoint in type animation
  const midpoint = Math.floor(placeholder.length / 2);
  manageInterval(input, 40, () => {
    // add one character at a time to placeholder
    input.placeholder = placeholder.slice(0, i + 1);
    i += 1;
    if (i === midpoint) {
      // run search query against placeholder at midpoint
      searchQuery(placeholder.slice(0, placeholder.length - 1), window.docs, results, isHomepageVariant);
    }
    if (i >= placeholder.length) { // check if full placeholder is displayed
      forceStop(input); // stop typing
      // scale delay based on placeholder length
      const delay = Math.ceil((placeholder.length * 200) / CURSOR_BLINK);
      blink(input, cb, delay); // trigger blink
    }
  });
}

/**
 * Simulates backspacing placeholder then triggers a blinking cursor.
 * @param {HTMLInputElement} input - Input element where placeholder will be updated.
 * @param {HTMLElement} results - Results container.
 * @param {Function} cb - Callback function to execute after backspacing and blinking effect finish.
 */
function backspace(input, results, cb) {
  let i = input.placeholder.length;
  // calculate midpoint in backspace animation
  const midpoint = Math.floor(i / 2);
  manageInterval(input, 20, () => {
    // remove one character at a time from placeholder
    input.placeholder = input.placeholder.slice(0, i - 1);
    i -= 1;
    // hide query results at midpoint
    if (i === midpoint) fadeOut(results);
    if (i <= 0) { // check if placeholder has been removed
      forceStop(input); // stop backspacing
      blink(input, cb); // trigger blink
    }
  });
}

/**
 * Rotates through placeholder options for an input element.
 * @param {number} currIndex - Current index of placeholder in placeholders array.
 * @param {HTMLInputElement} input - Input element where placeholder will be updated.
 * @param {HTMLInputElement} results - Results container.
 * @param {Array} placeholders - Array of placeholders to cycle through.
 * @param {boolean} isHomepageVariant - Whether the block is a homepage variant.
 */
function rotatePlaceholder(currIndex, input, results, placeholders, isHomepageVariant) {
  if (!isRotating(input)) {
    forceStop(input);
    return;
  }
  const ph = placeholders[currIndex];
  type(ph, input, results, () => { // simulate typing
    if (!isRotating(input)) {
      forceStop(input);
      return;
    }
    backspace(input, results, () => { // simulate backspacing
      if (!isRotating(input)) {
        forceStop(input);
        return;
      }
      // generate next placeholder index randomly (without immediate repetition)
      const nextIndex = generateIndex(currIndex, placeholders.length);
      rotatePlaceholder(nextIndex, input, results, placeholders, isHomepageVariant); // recursive call to loop
    });
  }, isHomepageVariant);
}

/**
 * Finds last visible link within results container.
 * @param {HTMLElement} results - Results container.
 * @returns {HTMLAnchorElement|null} Last visible link if exists, otherwise null.
 */
function findResultLink(results) {
  const links = results.querySelectorAll('a[href]');
  const result = links[links.length - 1];
  // only return link if visible to user
  return result.offsetParent ? result : null;
}

export default async function decorate(block) {
  // extract config
  const index = identifySource(block.querySelector('a[href]'));
  const faq = identifySource(block.querySelectorAll('a[href]')[1]) || '';
  // window.docs = [];
  const placeholders = [...block.querySelectorAll('li')].map((li) => li.textContent);
  const isHomepageVariant = block.classList.contains('homepage');
  // clear config
  const row = block.firstElementChild;
  row.innerHTML = '';

  // build search bar
  const form = createTag('form');
  const search = createTag('input', { type: 'search', 'aria-label': 'Search the documentation' });
  const clear = createTag('button', { type: 'reset' }, '✕');
  const icon = buildSearchIcon();
  form.append(icon, search, clear);
  row.append(form);

  // build results container
  const results = createTag('ul', { class: 'doc-search-results', 'aria-hidden': true });
  const noResults = createTag(
    'li',
    { class: 'doc-search-no-result', 'aria-hidden': true },
    'We didn\'t find a good match. <a href="/docs/">Visit our documentation page</a> for more.',
  );
  results.append(noResults);
  row.append(results);

  // add functionality to search bar
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // on form submit, send user to most relevant result
    const link = findResultLink(results);
    if (link) {
      link.focus();
      setTimeout(() => {
        window.location.href = link.href;
      }, 65);
    }
  });
  clear.addEventListener('click', () => {
    search.focus();
    fadeOut(results);
  });
  search.addEventListener('focus', () => {
    search.dataset.rotate = false;
    forceStop(search);
    search.placeholder = 'Search the documentation';
  });
  search.addEventListener('blur', () => {
    if (search.value === '') {
      setTimeout(() => {
        search.dataset.rotate = true;
        rotatePlaceholder(generateIndex(-1, placeholders.length), search, results, placeholders, isHomepageVariant);
      }, 1200);
    }
  });
  search.addEventListener('keyup', (e) => {
    const { key } = e;
    if (key === 'ArrowDown') {
      const link = findResultLink(results);
      if (link) link.focus();
    }
  });

  // observer block to trigger animation and load docs
  const observer = new IntersectionObserver(async (entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      observer.disconnect();
      // start placeholder rotation
      search.dataset.rotate = true;
      setTimeout(() => {
        rotatePlaceholder(generateIndex(-1, placeholders.length), search, results, placeholders, isHomepageVariant);
      }, 600);
      fetchSourceData(index, faq).then((docs) => {
        // enable search only after docs are available
        search.addEventListener('input', debounce(() => {
          searchQuery(search.value, docs, results, isHomepageVariant);
        }, 200));
      });
    }
  });
  observer.observe(block);
}
