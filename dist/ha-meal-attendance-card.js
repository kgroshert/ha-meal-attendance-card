class MealAttendanceCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    
    // Fetch person entities dynamically
    if (!this.persons) {
      this.persons = Object.values(hass.states)
        .filter(state => state.entity_id.startsWith('person.'))
        .sort((a, b) => a.attributes.friendly_name.localeCompare(b.attributes.friendly_name));
    }

    // Initialize compact HTML and CSS
    if (!this.content) {
      this.innerHTML = `
        <ha-card>
          <div class="card-content" style="padding: 12px 8px;"></div>
          <div class="version-marker">v1.4 (Android Fix)</div>
        </ha-card>
        <style>
          .matrix { display: grid; gap: 4px 2px; align-items: center; }
          .header { font-weight: bold; text-align: center; font-size: 0.85em; padding-bottom: 8px; border-bottom: 1px solid var(--divider-color); }
          .cell { padding: 2px; text-align: center; }
          .row-label { text-align: left; font-size: 0.85em; font-weight: bold; padding-left: 4px; line-height: 1.2; border-bottom: 1px solid rgba(150, 150, 150, 0.1); }
          .meal-sublabel { display: block; color: var(--secondary-text-color); font-size: 0.85em; font-weight: normal; }
          .tap-area { cursor: pointer; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; margin: 0 auto; background: var(--secondary-background-color); transition: background 0.2s; }
          .tap-area:active { background: var(--primary-color); }
          .tap-area.disabled { opacity: 0.5; cursor: not-allowed; }
          .yes { color: var(--success-color, green); }
          .plusone { color: var(--accent-color, #9c27b0); }
          .delayed { color: var(--info-color, #2196f3); }
          .no { color: var(--error-color, red); }
          .maybe { color: var(--warning-color, orange); }
          .unknown { color: var(--disabled-text-color, grey); }
          .weekend-row { background-color: rgba(150, 150, 150, 0.05); }
          .version-marker { text-align: right; font-size: 10px; color: var(--disabled-text-color); padding: 0 8px 8px 0; opacity: 0.7; }
        </style>
      `;
      this.content = this.querySelector('.card-content');
    }

    // Only render when the helpers change to prevent lag
    let shouldRender = !this._previousStates;
    this._previousStates = this._previousStates || {};
    
    if (this.config && this.config.helpers) {
      Object.values(this.config.helpers).forEach(entityId => {
        if (this._previousStates[entityId] !== hass.states[entityId]?.state) {
          shouldRender = true;
        }
      });
    }

    if (shouldRender && this.config) {
      this.render();
      Object.values(this.config.helpers).forEach(entityId => {
        this._previousStates[entityId] = hass.states[entityId]?.state;
      });
    }
  }

  setConfig(config) {
    if (!config.helpers) throw new Error('Please define the 7 daily helpers in configuration.');
    this.config = { restrict_editing: false, ...config };
  }

  getCardSize() {
    // 7 days, weekends have an extra breakfast row, plus the header
    return 10;
  }

  _getVoteData(entityId) {
    const stateObj = this._hass.states[entityId];
    if (!stateObj || !stateObj.state) return {};
    try { return JSON.parse(stateObj.state); } 
    catch (e) { return {}; }
  }

  _handleVote(entityId, mealKey, personObj) {
    const currentUserId = this._hass.user.id;
    const targetUserId = personObj.attributes.user_id;

    // Dispatch notification event directly to the DOM to prevent JS crashes
    if (this.config.restrict_editing && currentUserId !== targetUserId) {
      const event = new CustomEvent("hass-notification", {
        detail: { message: "You can only edit your own entries.", type: "error" },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
      return;
    }

    const data = this._getVoteData(entityId);
    const shortId = personObj.entity_id.replace('person.', ''); 
    
    if (!data[mealKey]) data[mealKey] = {};
    
    let currentVal = data[mealKey][shortId];
    
    // Normalize legacy full-word strings
    if (currentVal === 'yes') currentVal = 'y';
    if (currentVal === 'no') currentVal = 'n';
    if (currentVal === 'maybe') currentVal = 'm';

    let nextVal;
    
    // Apply custom cycle or use defaults
    let cycleStr = this.config.cycle;
    if (!cycleStr) {
      cycleStr = (mealKey === 'dinner') ? 'ypdnm' : 'ypnm';
    }

    if (!currentVal) {
      nextVal = cycleStr[0];
    } else {
      const idx = cycleStr.indexOf(currentVal);
      if (idx === -1 || idx >= cycleStr.length - 1) {
        nextVal = null; 
      } else {
        nextVal = cycleStr[idx + 1];
      }
    }
    
    if (nextVal) {
      data[mealKey][shortId] = nextVal;
    } else {
      delete data[mealKey][shortId];
      if (Object.keys(data[mealKey]).length === 0) {
        delete data[mealKey];
      }
    }

    const finalVote = nextVal || 'unknown';
    const dayName = entityId.replace('input_text.meals_', '');
    const friendlyName = personObj.attributes.friendly_name;
    const fromVote = currentVal || 'unknown';

    // Fire event immediately using callWS (Fixes Android Timer Bug)
    this._hass.callWS({
      type: "fire_event",
      event_type: "meal_vote_changed",
      event_data: {
        person: friendlyName,
        meal: mealKey,
        day: dayName,
        from_vote: fromVote,
        vote: finalVote
      }
    }).catch(err => {
      console.error("Failed to fire meal_vote_changed event:", err);
    });

    // Save state immediately to input_text
    this._hass.callService('input_text', 'set_value', {
      entity_id: entityId,
      value: JSON.stringify(data)
    });
  }

  _getIcon(vote) {
    switch(vote) {
      case 'yes': return 'mdi:check-circle';
      case 'plusone': return 'mdi:account-multiple';
      case 'delayed': return 'mdi:clock-outline'; 
      case 'no': return 'mdi:close-circle';
      case 'maybe': return 'mdi:help-circle';
      default: return 'mdi:circle-outline';
    }
  }

  render() {
    if (!this.persons || this.persons.length === 0) return;

    const currentUserId = this._hass.user.id;
    const usersCount = this.persons.length;
    
    let html = `<div class="matrix" style="grid-template-columns: minmax(70px, auto) repeat(${usersCount}, 1fr);">`;
    
    html += `<div class="cell header"></div>`;
    this.persons.forEach(person => {
      const shortName = person.attributes.friendly_name.split(' ')[0];
      html += `<div class="cell header">${shortName}</div>`;
    });

    const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const fullDayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      
      const dayIndex = targetDate.getDay(); 
      const dayKey = fullDayNames[dayIndex];
      const entityId = this.config.helpers[dayKey];
      const isWeekend = (dayIndex === 0 || dayIndex === 6);
      
      const voteData = this._getVoteData(entityId);
      const mealsToRender = [];
      
      if (isWeekend) mealsToRender.push({ key: 'breakfast', label: 'Brkfst' });
      mealsToRender.push({ key: 'dinner', label: 'Dinner' });

      mealsToRender.forEach((meal, index) => {
        const rowClass = isWeekend ? 'weekend-row' : '';
        const dateLabel = index === 0 ? `${dayNamesShort[dayIndex]} ${targetDate.getDate()}.${targetDate.getMonth() + 1}.` : '';

        html += `<div class="cell row-label ${rowClass}">
                   ${dateLabel}
                   <span class="meal-sublabel">${meal.label}</span>
                 </div>`;
        
        const mealVotes = voteData[meal.key] || {};
        
        this.persons.forEach(person => {
          const shortId = person.entity_id.replace('person.', '');
          const rawVote = mealVotes[shortId];
          
          let vote = 'unknown';
          if (rawVote === 'y' || rawVote === 'yes') vote = 'yes';
          if (rawVote === 'p') vote = 'plusone'; 
          if (rawVote === 'd') vote = 'delayed'; 
          if (rawVote === 'n' || rawVote === 'no') vote = 'no';
          if (rawVote === 'm' || rawVote === 'maybe') vote = 'maybe';

          const icon = this._getIcon(vote);
          const isLocked = this.config.restrict_editing && currentUserId !== person.attributes.user_id;
          const disabledClass = isLocked ? 'disabled' : '';
          
          const btnId = `btn-${dayKey}-${meal.key}-${person.entity_id.replace('.', '-')}`;
          
          html += `
            <div class="cell ${rowClass}">
              <div id="${btnId}" class="tap-area ${disabledClass}">
                <ha-icon icon="${icon}" class="${vote}"></ha-icon>
              </div>
            </div>
          `;
        });
      });
    }

    html += `</div>`;
    this.content.innerHTML = html;

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      const dayIndex = targetDate.getDay();
      const dayKey = fullDayNames[dayIndex];
      const entityId = this.config.helpers[dayKey];
      const isWeekend = (dayIndex === 0 || dayIndex === 6);
      
      const mealsToRender = isWeekend ? ['breakfast', 'dinner'] : ['dinner'];

      mealsToRender.forEach(mealKey => {
        this.persons.forEach(person => {
          const btnId = `btn-${dayKey}-${mealKey}-${person.entity_id.replace('.', '-')}`;
          const el = this.querySelector(`#${btnId}`);
          if (el) {
            el.onclick = () => this._handleVote(entityId, mealKey, person);
          }
        });
      });
    }
  }
}

if (!customElements.get('meal-attendance-card')) {
  customElements.define('meal-attendance-card', MealAttendanceCard);
}

// Register the card in the Lovelace card picker
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'meal-attendance-card')) {
  window.customCards.push({
    type: 'meal-attendance-card',
    name: 'Meal Attendance Card',
    description: 'Weekly matrix where every household member votes whether they join breakfast and dinner.',
    documentationURL: 'https://github.com/kgroshert/ha-meal-attendance-card',
  });
}