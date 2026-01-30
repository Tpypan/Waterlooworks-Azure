/**
 * Job Information Rearranger for WaterlooWorks Azure
 * Reorders job posting info to show important stuff first
 */

const JobInfoRearranger = {
  initialized: false,

  // Fields to show at top in priority box
  priorityFields: [
    'work term duration',
    'location', // We'll build this from city + province
    'compensation',
    'benefits',
    'compensation and benefits',
    'application deadline',
    'apply by'
  ],

  // Application method - only show if irregular
  methodField: 'application method',

  // Standard order after priority
  standardOrder: [
    'job summary',
    'summary',
    'job responsibilities', 
    'responsibilities',
    'required skills',
    'skills',
    'job requirements',
    'requirements',
    'targeted degrees',
    'disciplines'
  ],

  init() {
    if (this.initialized) return;
    
    const url = window.location.href;
    if (!url.includes('posting')) return;

    console.log('[Azure] Initializing job info rearranger');
    
    // Wait for content to load
    setTimeout(() => this.rearrange(), 800);
    this.initialized = true;
  },

  rearrange() {
    // Find the job posting container
    const container = document.querySelector('#postingDiv') ||
                      document.querySelector('.posting-details') ||
                      document.querySelector('#mainContentDiv .boxContent') ||
                      document.querySelector('#mainContentDiv');
    
    if (!container) {
      console.log('[Azure] No container found');
      return;
    }

    // Parse all the field/value pairs from the page
    const fields = this.parseFields(container);
    console.log('[Azure] Parsed fields:', fields);

    if (Object.keys(fields).length === 0) {
      console.log('[Azure] No fields found');
      return;
    }

    // Build the priority info section
    const priorityData = this.extractPriorityData(fields);
    
    // Create and insert the priority box
    this.insertPriorityBox(container, priorityData);
    
    // Reorder the remaining content
    this.reorderContent(container, fields);
  },

  parseFields(container) {
    const fields = {};
    
    // Method 1: Find bold elements followed by text
    const boldElements = container.querySelectorAll('strong, b');
    
    boldElements.forEach(bold => {
      let label = bold.textContent.trim().replace(/:$/, '').toLowerCase();
      
      // Get the value - could be next sibling text or next element
      let value = '';
      let valueNode = bold.nextSibling;
      
      // Collect text until next bold or block element
      while (valueNode) {
        if (valueNode.nodeType === Node.TEXT_NODE) {
          value += valueNode.textContent;
        } else if (valueNode.nodeType === Node.ELEMENT_NODE) {
          if (valueNode.tagName === 'STRONG' || valueNode.tagName === 'B') break;
          if (valueNode.tagName === 'BR') {
            value += ' ';
          } else {
            value += valueNode.textContent;
          }
        }
        valueNode = valueNode.nextSibling;
      }
      
      value = value.trim();
      if (label && value) {
        fields[label] = { value, element: bold.parentElement || bold };
      }
    });

    // Method 2: Look for label:value patterns in divs/paragraphs
    const textBlocks = container.querySelectorAll('p, div, span, td');
    textBlocks.forEach(block => {
      const text = block.textContent.trim();
      const colonIdx = text.indexOf(':');
      if (colonIdx > 0 && colonIdx < 60) {
        const label = text.substring(0, colonIdx).trim().toLowerCase();
        const value = text.substring(colonIdx + 1).trim();
        if (label && value && !fields[label]) {
          fields[label] = { value, element: block };
        }
      }
    });

    return fields;
  },

  extractPriorityData(fields) {
    const priority = [];

    // Work Term Duration
    const duration = this.findField(fields, ['work term duration', 'duration', 'term duration']);
    if (duration) {
      priority.push({ label: 'Duration', value: duration.value, key: 'duration' });
    }

    // Location - combine city and province
    const city = this.findField(fields, ['job - city', 'city', 'job city']);
    const province = this.findField(fields, ['job - province/state', 'province', 'state', 'job province']);
    if (city || province) {
      const locationParts = [];
      if (city) locationParts.push(city.value);
      if (province) locationParts.push(province.value);
      priority.push({ label: 'Location', value: locationParts.join(', '), key: 'location' });
    } else {
      // Try region field
      const region = this.findField(fields, ['region', 'location']);
      if (region) {
        priority.push({ label: 'Location', value: region.value, key: 'location' });
      }
    }

    // Compensation
    const comp = this.findField(fields, ['compensation', 'salary', 'pay', 'compensation and benefits', 'benefits']);
    if (comp) {
      priority.push({ label: 'Compensation', value: comp.value, key: 'compensation' });
    }

    // Application Deadline
    const deadline = this.findField(fields, ['application deadline', 'deadline', 'apply by', 'due date']);
    if (deadline) {
      priority.push({ label: 'Deadline', value: deadline.value, key: 'deadline' });
    }

    // Application Method - only if irregular
    const method = this.findField(fields, ['application method', 'how to apply', 'apply method']);
    if (method) {
      const methodLower = method.value.toLowerCase();
      // Only show if NOT just "WaterlooWorks"
      if (!methodLower.match(/^waterlooworks$/i) && 
          !methodLower.match(/^waterlooworks only$/i) &&
          methodLower.length > 0) {
        priority.push({ label: 'Apply Via', value: method.value, key: 'method' });
      }
    }

    return priority;
  },

  findField(fields, possibleNames) {
    for (const name of possibleNames) {
      // Exact match
      if (fields[name]) return fields[name];
      
      // Partial match
      for (const key of Object.keys(fields)) {
        if (key.includes(name) || name.includes(key)) {
          return fields[key];
        }
      }
    }
    return null;
  },

  insertPriorityBox(container, priorityData) {
    if (priorityData.length === 0) {
      console.log('[Azure] No priority data to show');
      return;
    }

    // Remove existing priority box if any
    const existing = document.querySelector('.azure-priority-box');
    if (existing) existing.remove();

    // Create the priority box
    const box = document.createElement('div');
    box.className = 'azure-priority-box';
    
    let html = '<div class="azure-priority-header">📋 Key Information</div>';
    html += '<div class="azure-priority-content">';
    
    for (const item of priorityData) {
      html += `
        <div class="azure-priority-item azure-priority-${item.key}">
          <span class="azure-priority-label">${item.label}</span>
          <span class="azure-priority-value">${item.value}</span>
        </div>
      `;
    }
    
    html += '</div>';
    box.innerHTML = html;

    // Insert at the very top of the container
    const firstChild = container.firstElementChild;
    if (firstChild) {
      container.insertBefore(box, firstChild);
    } else {
      container.appendChild(box);
    }

    console.log('[Azure] Priority box inserted');
  },

  reorderContent(container, fields) {
    // For now, we'll just highlight the standard sections
    // Full reordering would require more DOM manipulation
    
    // Add visual indicators to important sections
    const boldElements = container.querySelectorAll('strong, b');
    
    boldElements.forEach(bold => {
      const label = bold.textContent.trim().toLowerCase().replace(/:$/, '');
      
      // Check if this is a priority field - dim it since we showed it above
      const isPriority = this.priorityFields.some(p => label.includes(p) || p.includes(label));
      const isCity = label.includes('city') || label.includes('province');
      
      if (isPriority || isCity) {
        // Dim the original since we're showing it in priority box
        const parent = bold.parentElement;
        if (parent) {
          parent.classList.add('azure-dimmed-field');
        }
      }
      
      // Highlight standard important sections
      const isStandard = this.standardOrder.some(s => label.includes(s) || s.includes(label));
      if (isStandard) {
        bold.classList.add('azure-important-section');
      }
    });
  }
};

// Auto-initialize
if (typeof window !== 'undefined') {
  window.AzureJobInfoRearranger = JobInfoRearranger;
  
  // Try to init on load
  if (document.readyState === 'complete') {
    JobInfoRearranger.init();
  } else {
    window.addEventListener('load', () => JobInfoRearranger.init());
  }
}
