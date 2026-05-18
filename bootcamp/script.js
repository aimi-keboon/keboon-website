const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxC2WivMUgPbq4T4P8h7eFmy-1tR7JGQy7UrTKFtFv4EzKt3nwkoENvbXZbGNMLj_nfEQ/exec';

const COURSE_DURATION_MINUTES = 570;
const MIN_DAYS_AHEAD = 5;

const countries = [
  { name: 'Afghanistan', code: '+93' },
  { name: 'Albania', code: '+355' },
  { name: 'Algeria', code: '+213' },
  { name: 'Argentina', code: '+54' },
  { name: 'Australia', code: '+61' },
  { name: 'Austria', code: '+43' },
  { name: 'Bangladesh', code: '+880' },
  { name: 'Belgium', code: '+32' },
  { name: 'Brazil', code: '+55' },
  { name: 'Brunei', code: '+673' },
  { name: 'Cambodia', code: '+855' },
  { name: 'Canada', code: '+1' },
  { name: 'China', code: '+86' },
  { name: 'Denmark', code: '+45' },
  { name: 'Egypt', code: '+20' },
  { name: 'Finland', code: '+358' },
  { name: 'France', code: '+33' },
  { name: 'Germany', code: '+49' },
  { name: 'Hong Kong', code: '+852' },
  { name: 'India', code: '+91' },
  { name: 'Indonesia', code: '+62' },
  { name: 'Ireland', code: '+353' },
  { name: 'Italy', code: '+39' },
  { name: 'Japan', code: '+81' },
  { name: 'Malaysia', code: '+60' },
  { name: 'Mexico', code: '+52' },
  { name: 'Netherlands', code: '+31' },
  { name: 'New Zealand', code: '+64' },
  { name: 'Nigeria', code: '+234' },
  { name: 'Pakistan', code: '+92' },
  { name: 'Philippines', code: '+63' },
  { name: 'Poland', code: '+48' },
  { name: 'Portugal', code: '+351' },
  { name: 'Saudi Arabia', code: '+966' },
  { name: 'Singapore', code: '+65' },
  { name: 'South Africa', code: '+27' },
  { name: 'South Korea', code: '+82' },
  { name: 'Spain', code: '+34' },
  { name: 'Sri Lanka', code: '+94' },
  { name: 'Sweden', code: '+46' },
  { name: 'Switzerland', code: '+41' },
  { name: 'Thailand', code: '+66' },
  { name: 'Turkey', code: '+90' },
  { name: 'United Arab Emirates', code: '+971' },
  { name: 'United Kingdom', code: '+44' },
  { name: 'United States', code: '+1' },
  { name: 'Vietnam', code: '+84' },
  { name: 'Other', code: '' }
];

const bookingForm = document.getElementById('bookingForm');
const countrySelect = document.getElementById('country');
const countryCodeSelect = document.getElementById('countryCode');
const manualCountryCodeWrap = document.getElementById('manualCountryCodeWrap');
const manualCountryCodeInput = document.getElementById('manualCountryCode');
const preferredDateInput = document.getElementById('preferredDate');
const preferredStartTimeInput = document.getElementById('preferredStartTime');
const preferredEndTimeInput = document.getElementById('preferredEndTime');
const preferredStartIsoInput = document.getElementById('preferredStartIso');
const preferredEndIsoInput = document.getElementById('preferredEndIso');
const timezoneInput = document.getElementById('timezone');
const timezoneDisplay = document.getElementById('timezoneDisplay');
const endTimeDisplay = document.getElementById('endTimeDisplay');
const computedSchedule = document.getElementById('computedSchedule');
const sessionBreakdown = document.getElementById('sessionBreakdown');
const goalSelect = document.getElementById('goal');
const otherGoalWrap = document.getElementById('otherGoalWrap');
const otherGoalInput = document.getElementById('otherGoal');
const statusBox = document.getElementById('statusBox');
const submitButton = document.getElementById('submitButton');
const dateHint = document.getElementById('dateHint');
const slotStatusBox = document.getElementById('slotStatusBox');
const slotIdInput = document.getElementById('slotId');
const slotModeInput = document.getElementById('slotMode');

const salesPartnerForm = document.getElementById('salesPartnerForm');
const salesPartnerButton = document.getElementById('salesPartnerButton');
const salesPartnerStatus = document.getElementById('salesPartnerStatus');
const referralResult = document.getElementById('referralResult');
const generatedReferralLink = document.getElementById('generatedReferralLink');
const copyReferralLinkButton = document.getElementById('copyReferralLinkButton');

document.addEventListener('DOMContentLoaded', function() {
  setSalesRefFromUrl();
  populateCountries();
  populateCountryCodes();
  populateTimeOptions();
  setMinimumDate();
  setTimezone();
  bindEvents();
});

function setSalesRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') || '';

  const salesRefInput = document.getElementById('salesRef');

  if (salesRefInput) {
    salesRefInput.value = ref.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  }
}

function apiRequest(action, payload) {
  return new Promise(function(resolve, reject) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
      reject(new Error('Apps Script URL is not configured in script.js.'));
      return;
    }

    const callbackName = 'appsScriptCallback_' + Date.now() + '_' + Math.floor(Math.random() * 100000);

    const params = new URLSearchParams();
    params.set('action', action);
    params.set('callback', callbackName);
    params.set('payload', JSON.stringify(payload || {}));

    const script = document.createElement('script');
    script.src = APPS_SCRIPT_URL + '?' + params.toString();

    const timeout = setTimeout(function() {
      cleanup();
      reject(new Error('Request timed out. Please try again.'));
    }, 30000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];

      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function(response) {
      cleanup();
      resolve(response);
    };

    script.onerror = function() {
      cleanup();
      reject(new Error('Unable to connect to the booking server.'));
    };

    document.body.appendChild(script);
  });
}

function populateCountries() {
  countrySelect.innerHTML = '<option value="">Select country</option>';

  countries.forEach(function(country) {
    const option = document.createElement('option');
    option.value = country.name;
    option.textContent = country.name;
    countrySelect.appendChild(option);
  });
}

function populateCountryCodes() {
  countryCodeSelect.innerHTML = '<option value="">Select code</option>';

  countries
    .filter(function(country) {
      return country.code;
    })
    .forEach(function(country) {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = `${country.code} ${country.name}`;
      countryCodeSelect.appendChild(option);
    });

  const manualOption = document.createElement('option');
  manualOption.value = 'manual';
  manualOption.textContent = 'Other / enter manually';
  countryCodeSelect.appendChild(manualOption);
}

function populateTimeOptions() {
  preferredStartTimeInput.innerHTML = '<option value="">Select start time</option>';

  for (let hour = 0; hour < 24; hour++) {
    [0, 30].forEach(function(minute) {
      const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      preferredStartTimeInput.appendChild(option);
    });
  }
}

function setMinimumDate() {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + MIN_DAYS_AHEAD);

  const formatted = formatDateInputValue(minDate);

  preferredDateInput.min = formatted;
  dateHint.textContent = `Earliest available booking date: ${formatted}`;
}

function setTimezone() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  timezoneInput.value = timezone;
  timezoneDisplay.textContent = timezone;
}

function bindEvents() {
  countrySelect.addEventListener('change', autoSelectCountryCode);
  countryCodeSelect.addEventListener('change', handleCountryCodeChange);
  goalSelect.addEventListener('change', handleGoalChange);
  preferredDateInput.addEventListener('change', handleDateChange);
  preferredStartTimeInput.addEventListener('change', updateComputedSchedule);
  bookingForm.addEventListener('submit', handleSubmit);

  if (salesPartnerForm) {
    salesPartnerForm.addEventListener('submit', handleSalesPartnerSubmit);
  }

  if (copyReferralLinkButton) {
    copyReferralLinkButton.addEventListener('click', copyReferralLink);
  }
}

function autoSelectCountryCode() {
  const selectedCountry = countries.find(function(country) {
    return country.name === countrySelect.value;
  });

  if (selectedCountry && selectedCountry.code) {
    countryCodeSelect.value = selectedCountry.code;
    manualCountryCodeWrap.style.display = 'none';
    manualCountryCodeInput.required = false;
    manualCountryCodeInput.value = '';
  } else if (selectedCountry && selectedCountry.name === 'Other') {
    countryCodeSelect.value = 'manual';
    manualCountryCodeWrap.style.display = 'grid';
    manualCountryCodeInput.required = true;
  }
}

function handleCountryCodeChange() {
  if (countryCodeSelect.value === 'manual') {
    manualCountryCodeWrap.style.display = 'grid';
    manualCountryCodeInput.required = true;
  } else {
    manualCountryCodeWrap.style.display = 'none';
    manualCountryCodeInput.required = false;
    manualCountryCodeInput.value = '';
  }
}

function getFinalCountryCode() {
  if (countryCodeSelect.value === 'manual') {
    return manualCountryCodeInput.value.trim();
  }

  return countryCodeSelect.value.trim();
}

function handleGoalChange() {
  if (goalSelect.value === 'Other') {
    otherGoalWrap.classList.add('show');
    otherGoalInput.required = true;
  } else {
    otherGoalWrap.classList.remove('show');
    otherGoalInput.required = false;
    otherGoalInput.value = '';
  }
}

function handleDateChange() {
  resetSlotState();

  const selectedDate = preferredDateInput.value;

  if (!selectedDate) {
    return;
  }

  setSlotStatus('available', 'Checking available session slot for this date...');
  submitButton.disabled = true;

  apiRequest('getSlotAvailability', {
    preferredDate: selectedDate
  })
    .then(function(response) {
      if (!response || !response.success) {
        setSlotStatus('error', response && response.message ? response.message : 'Unable to check slot availability.');
        submitButton.disabled = true;
        return;
      }

      applySlotAvailability(response);
    })
    .catch(function(error) {
      setSlotStatus('error', error.message || 'Unable to check slot availability.');
      submitButton.disabled = true;
    });
}

function applySlotAvailability(response) {
  if (response.status === 'empty') {
    slotModeInput.value = 'new_slot';
    slotIdInput.value = '';

    preferredStartTimeInput.disabled = false;
    preferredStartTimeInput.required = true;
    preferredStartTimeInput.value = '';

    computedSchedule.style.display = 'none';
    submitButton.disabled = false;

    setSlotStatus(
      'empty',
      'No existing session found for this date. You can choose your preferred start time.'
    );

    return;
  }

  if (response.status === 'available_existing_slot') {
    slotModeInput.value = 'existing_slot';
    slotIdInput.value = response.slotId || '';

    const start = new Date(response.slotStartIso);
    const end = new Date(response.slotEndIso);

    preferredStartTimeInput.disabled = false;
    preferredStartTimeInput.required = true;
    preferredStartTimeInput.value = formatTimeInputValue(start);
    preferredStartTimeInput.disabled = true;

    preferredStartIsoInput.value = start.toISOString();
    preferredEndIsoInput.value = end.toISOString();
    preferredEndTimeInput.value = formatReadableDateTime(end);

    endTimeDisplay.textContent = formatReadableDateTime(end);
    renderSessionBreakdown(start);
    computedSchedule.style.display = 'grid';

    submitButton.disabled = false;

    setSlotStatus(
      'available',
      `A session is available on this date: ${formatReadableDateTime(start)} - ${formatReadableDateTime(end)}. Seats left: ${response.seatsLeft}.`
    );

    return;
  }

  if (response.status === 'full') {
    slotModeInput.value = 'full';
    slotIdInput.value = response.slotId || '';

    preferredStartTimeInput.disabled = true;
    preferredStartTimeInput.required = false;
    preferredStartTimeInput.value = '';

    computedSchedule.style.display = 'none';
    submitButton.disabled = true;

    setSlotStatus(
      'full',
      'This session is fully booked. Please choose another date.'
    );
  }
}

function resetSlotState() {
  slotModeInput.value = '';
  slotIdInput.value = '';

  preferredStartTimeInput.disabled = false;
  preferredStartTimeInput.required = true;
  preferredStartTimeInput.value = '';

  preferredEndTimeInput.value = '';
  preferredStartIsoInput.value = '';
  preferredEndIsoInput.value = '';

  computedSchedule.style.display = 'none';
  slotStatusBox.style.display = 'none';
  slotStatusBox.textContent = '';

  submitButton.disabled = false;
}

function updateComputedSchedule() {
  const date = preferredDateInput.value;
  const startTime = preferredStartTimeInput.value;

  hideStatus();

  if (!date || !startTime) {
    computedSchedule.style.display = 'none';
    preferredEndTimeInput.value = '';
    preferredStartIsoInput.value = '';
    preferredEndIsoInput.value = '';
    return;
  }

  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(start.getTime() + COURSE_DURATION_MINUTES * 60 * 1000);

  preferredEndTimeInput.value = formatReadableDateTime(end);
  preferredStartIsoInput.value = start.toISOString();
  preferredEndIsoInput.value = end.toISOString();

  endTimeDisplay.textContent = formatReadableDateTime(end);

  renderSessionBreakdown(start);

  computedSchedule.style.display = 'grid';
}

function renderSessionBreakdown(start) {
  const blocks = [
    { label: 'Block 1', minutes: 120 },
    { label: 'Break', minutes: 15 },
    { label: 'Block 2', minutes: 120 },
    { label: 'Main break', minutes: 60 },
    { label: 'Block 3', minutes: 120 },
    { label: 'Break', minutes: 15 },
    { label: 'Block 4', minutes: 120 }
  ];

  sessionBreakdown.innerHTML = '';

  let cursor = new Date(start);

  blocks.forEach(function(block) {
    const blockStart = new Date(cursor);
    const blockEnd = new Date(cursor.getTime() + block.minutes * 60 * 1000);

    const div = document.createElement('div');
    div.className = 'session-block';
    div.textContent = `${block.label}: ${formatTimeOnly(blockStart)} - ${formatTimeOnly(blockEnd)}`;
    sessionBreakdown.appendChild(div);

    cursor = blockEnd;
  });
}

function handleSubmit(event) {
  event.preventDefault();

  hideStatus();

  if (!bookingForm.checkValidity()) {
    bookingForm.reportValidity();
    return;
  }

  if (!preferredDateInput.value) {
    showStatus('error', 'Please select your preferred date.');
    return;
  }

  if (slotModeInput.value === 'full') {
    showStatus('error', 'This session is fully booked. Please choose another date.');
    return;
  }

  if (slotModeInput.value === 'new_slot') {
    updateComputedSchedule();
  }

  if (!preferredStartIsoInput.value || !preferredEndIsoInput.value) {
    showStatus('error', 'Please select your preferred date and start time.');
    return;
  }

  const finalCountryCode = getFinalCountryCode();

  if (!finalCountryCode) {
    showStatus('error', 'Please select or enter a country code.');
    return;
  }

  const formData = {
    fullName: document.getElementById('fullName').value,
    email: document.getElementById('email').value,
    countryCode: finalCountryCode,
    mobileNumber: document.getElementById('mobileNumber').value,
    country: document.getElementById('country').value,
    goal: document.getElementById('goal').value,
    otherGoal: document.getElementById('otherGoal').value,
    preferredDate: document.getElementById('preferredDate').value,
    preferredStartTime: document.getElementById('preferredStartTime').value,
    preferredEndTime: document.getElementById('preferredEndTime').value,
    timezone: document.getElementById('timezone').value,
    preferredStartIso: document.getElementById('preferredStartIso').value,
    preferredEndIso: document.getElementById('preferredEndIso').value,
    salesRef: document.getElementById('salesRef').value
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Saving booking...';

  apiRequest('submitBooking', formData)
    .then(function(response) {
      if (!response || !response.success) {
        showStatus('error', response && response.message ? response.message : 'Unable to save booking.');
        resetSubmitButton();
        return;
      }

      showStatus('success', 'Booking saved. Redirecting to payment page...');

      setTimeout(function() {
        window.location.href = response.redirectUrl;
      }, 900);
    })
    .catch(function(error) {
      showStatus('error', error.message || 'Something went wrong. Please try again.');
      resetSubmitButton();
    });
}

function handleSalesPartnerSubmit(event) {
  event.preventDefault();

  hideSalesPartnerStatus();

  const fullName = document.getElementById('salesPartnerName').value.trim();
  const email = document.getElementById('salesPartnerEmail').value.trim();

  if (!fullName || !email) {
    showSalesPartnerStatus('error', 'Please enter your name and email address.');
    return;
  }

  salesPartnerButton.disabled = true;
  salesPartnerButton.textContent = 'Generating referral link...';

  apiRequest('registerSalesPartner', {
    fullName: fullName,
    email: email
  })
    .then(function(response) {
      if (!response || !response.success) {
        showSalesPartnerStatus('error', response && response.message ? response.message : 'Unable to generate referral link.');
        resetSalesPartnerButton();
        return;
      }

      generatedReferralLink.value = response.referralLink;
      referralResult.style.display = 'grid';

      showSalesPartnerStatus('success', response.message || 'Referral link generated successfully.');
      resetSalesPartnerButton();
    })
    .catch(function(error) {
      showSalesPartnerStatus('error', error.message || 'Something went wrong. Please try again.');
      resetSalesPartnerButton();
    });
}

function copyReferralLink() {
  const link = generatedReferralLink.value;

  if (!link) {
    return;
  }

  navigator.clipboard.writeText(link).then(function() {
    copyReferralLinkButton.textContent = 'Copied';

    setTimeout(function() {
      copyReferralLinkButton.textContent = 'Copy';
    }, 1500);
  });
}

function setSlotStatus(type, message) {
  slotStatusBox.className = `slot-status-box ${type}`;
  slotStatusBox.style.display = 'block';
  slotStatusBox.textContent = message;
}

function formatDateInputValue(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeInputValue(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTimeOnly(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatReadableDateTime(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hour}:${minute}`;
}

function showStatus(type, message) {
  statusBox.className = `status show ${type}`;
  statusBox.textContent = message;
}

function hideStatus() {
  statusBox.className = 'status';
  statusBox.textContent = '';
}

function resetSubmitButton() {
  submitButton.disabled = false;
  submitButton.textContent = 'Reserve My Seat and Continue to Payment';
}

function showSalesPartnerStatus(type, message) {
  salesPartnerStatus.className = `status show ${type}`;
  salesPartnerStatus.textContent = message;
}

function hideSalesPartnerStatus() {
  salesPartnerStatus.className = 'status';
  salesPartnerStatus.textContent = '';
}

function resetSalesPartnerButton() {
  salesPartnerButton.disabled = false;
  salesPartnerButton.textContent = 'Generate My Referral Link';
}