let fullTaskStart = null;
let fullTaskEnd = null;
let taskTimestamps = [];

// Display only on laptop or desktop
function isMobileDevice() {
    const width = window.innerWidth;
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|tablet/.test(userAgent);
    return isMobile || width < 768;
}
  
window.addEventListener('DOMContentLoaded', () => {
    const mobileWarning = document.getElementById('mobileWarning');
    const mainContent = document.getElementById('languageSelectorScreen');
  
    if (!mobileWarning || !mainContent) {
      console.warn("Elements not found: #mobileWarning or #languageSelectorScreen");
      return;
    }
  
    if (isMobileDevice()) {
      mobileWarning.style.display = 'block';
      mainContent.style.display = 'none';
    } else {
      mobileWarning.style.display = 'none';
      mainContent.style.display = 'block';
    }
});  


// ----- Multilingual UI & Initial Language Selector Logic -----

let uiTranslations = {};
let currentLang = 'English'; // fallback
const LANG_PATH = './lang/';

// --- Global variables (original) ---
let testType = 'slider'; // default, will be updated below
let questionType = '';
let selectTestRounds = 0;
let sliderTestRounds = 0;
let selectedLanguages = {};
let textData = {};
let usedTexts = new Set();
let shuffledTexts = [];
let responseCounts = {};
let questionLanguages = {};
let results = [];
let participantId = undefined;

function submitScreeningSurvey(data) { 
    const selectedUILanguage = sessionStorage.getItem('selectedUILanguage') || currentLang;  
    const finalData = { ...data, "uiLanguage": selectedUILanguage };
    fetch(`https://comfort-read.isoquac.net/submitScreeningSurvey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData)
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data && data.id && data.languageRounds) {
            participantId = data.id;
            questionType = data.languageRounds.questionType; // 1A/1B/2A/2B, each require different behavior
            questionLanguages = data.languageRounds.languages;
            console.log(data.languageRounds);

            // if question starts with "1" then it's the slider test, else select test
            if (questionType.startsWith("1")) {

                testType = "slider";
            } else {
                testType = "select";
            }
            // Task intro
            const taskContent = document.getElementById('taskTextContent');
            // Clear any existing content inside the div
            taskContent.innerHTML = '';
            // Choose instruction set based on test type
            let instructions = testType === 'slider'
                ? [sliderInstruction, sliderInstruction2]
                : [selectInstruction, selectInstruction2];
            // Create and append each <p> dynamically
            instructions.forEach(text => {
                const p = document.createElement('p');
                p.innerText = text;
                taskContent.appendChild(p);
            });
            document.getElementById('startTaskButton').disabled = false; // enable start button
        }
    })
    .catch(error => {
        console.error("Error fetching test languages:", error);
    });
}

function getViewportMetrics() {
  const metrics = {
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight
    },
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight
    },
    visualViewport: window.visualViewport ? {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      scale: window.visualViewport.scale
    } : null,
    devicePixelRatio: window.devicePixelRatio
  };
  return metrics;
}

// --- Load text dataset (unchanged) ---
fetch('./texts.json')
    .then(response => response.json())
    .then(data => {
        textData = data; // Store data
    })
    .catch(error => console.error('Error loading the JSON file:', error));

// --- Static test instructions (will be replaced by translation if available) ---
let sliderInstruction = 'On the following screens you will see fragments of texts in various languages that you might know or might not know. Adjust the space between the lines, words, and letters to make the text more comfortable to read, if you feel this adjustment is necessary. You don’t have to comprehend the content of the text.';
let sliderInstruction2 = 'There are no right or wrong answers, so feel free to make the adjustment that provide the most comfortable reading experience for you. You can fine-tune the setting by dragging the slider bars.';
let selectInstruction = 'There are no right or wrong answers, so feel free to make the adjustment that provide the most comfortable reading experience for you. You can fine-tune the setting by dragging the slider bars.';
let selectInstruction2 = 'Please, try to make a selection even if it is difficult to decide. There are no right or wrong answers.';

window.onload = function() {
    // Show only language selector screen initially
    document.body.scrollTop = 0;
    document.getElementById('languageSelectorScreen').style.display = 'flex';
    document.getElementById('welcomeScreen').style.display = 'none';
    [
        'demographicsScreen', 'taskScreen', 'sliderTestScreen',
        'selectTestScreen', 'thankYouScreen', 'termsConditionsPopup', 'reasonChangePopup'
    ].forEach(id => { let el = document.getElementById(id); if (el) el.style.display = 'none'; });
    // Prepare default test instruction (will be overwritten if translation is loaded)
    document.getElementById('taskTextContent').innerText = '';
};

// --- DOMContentLoaded: Initial Language Screen logic and page flow ---
document.addEventListener("DOMContentLoaded", function () {
    // --- Language Selection Screen ---
    const langSelect = document.getElementById('uiLanguageSelector');
    const nextBtn = document.getElementById('uiLanguageNextBtn');
    langSelect.addEventListener('change', () => nextBtn.disabled = !langSelect.value);
    nextBtn.addEventListener('click', () => {
        currentLang = langSelect.value;
        // --- Store selected UI language for later use ---
        sessionStorage.setItem('selectedUILanguage', currentLang);
        loadAndApplyTranslations(currentLang);
    });    

    // --- Step 1: Welcome > Demographics ---
    const proceedButton = document.getElementById('nextSlideFirst');
    const termsCheckbox = document.querySelector('input[name="Terms and Conditions"]');
    function toggleProceedButton() {
        proceedButton.disabled = !termsCheckbox.checked; // Enable only when checked
        proceedButton.classList.toggle('disabled');
    }
    termsCheckbox.addEventListener('change', toggleProceedButton);
    toggleProceedButton(); // Initialize button state

    proceedButton.addEventListener('click', nextSlideFirst);
    function nextSlideFirst() {
        document.getElementById('welcomeScreen').style.display = 'none';
        document.body.scrollTop = 0;
        document.getElementById('demographicsScreen').style.display = 'flex';
        requestFullScreen();
    }
    function requestFullScreen() {
        let elem = document.documentElement;
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
    }

    document.getElementById('termsConditionsLink').addEventListener('click', openTermsConditions);
    function openTermsConditions() {
        document.getElementById('termsConditionsPopup').style.display = 'flex';
    }
    document.getElementById('closeTermsButton').addEventListener('click', closeTermsConditions);
    function closeTermsConditions() {
        document.getElementById('termsConditionsPopup').style.display = 'none';
    }

    // --- Step 2: Demographics > Task ---
    let languageCount = 1;
    const languageContainer = document.getElementById("otherLanguagesContainer");
    const addButton = document.getElementById("moreLanguage");
    addButton.addEventListener("click", function (event) {
        event.preventDefault();
        languageCount++;
        const languageWrapper = document.createElement("div");
        languageWrapper.classList.add("languageWrapper");
        languageWrapper.setAttribute("id", `languageWrapper${languageCount}`);
        const newSelect = document.createElement("select");
        newSelect.name = `otherLanguage${languageCount}`;
        newSelect.id = `otherLanguage${languageCount}`;
        newSelect.innerHTML = document.getElementById("otherLanguage1").innerHTML;
        const deleteButton = document.createElement("button");
        deleteButton.classList.add("deleteLanguageButton");
        deleteButton.addEventListener("click", function () {
            languageWrapper.remove();
        });
        languageWrapper.appendChild(newSelect);
        languageWrapper.appendChild(deleteButton);
        languageContainer.insertBefore(languageWrapper, addButton);
    });

    const nextButton = document.getElementById('nextDemographicsButton');
    // No more "nativeLanguage" logic here: move to UI language screen
    nextButton.addEventListener('click', nextSlideSecond);
    function nextSlideSecond() {
        let formData = collectDemographicsData();
        submitScreeningSurvey(formData);
        // sleep 250ms to allow time for any UI updates
        setTimeout(() => {
            document.getElementById('demographicsScreen').style.display = 'none';
            document.body.scrollTop = 0;
            document.getElementById('taskScreen').style.display = 'flex';
        }, 250);
    }

    // Demographic form filled validator 
    function validateDemographicsForm() {
        const form = document.getElementById('additionalForm');
    
        const nativeLang = form.querySelector('#nativeLanguage');
        const age = form.querySelector('select[name="ageRange"]');
        const booksRead = form.querySelector('input[name="booksRead"]');
        const booksTimeframe = form.querySelector('select[name="booksTimeframe"]');
        const academic = form.querySelectorAll('input[name="academicReading"]:checked');
        const graphic = form.querySelectorAll('input[name="graphicDesign"]:checked');
        const everydayChecks = form.querySelectorAll('input[name="everydayReading"]:checked');
    
        const isValid =
            nativeLang.value &&
            age.value &&
            booksRead.value &&
            booksTimeframe.value &&
            academic.length > 0 &&
            graphic.length > 0 &&
            everydayChecks.length > 0;
    
        document.getElementById('nextDemographicsButton').disabled = !isValid;
    }
    
    // Re-check on any change
    document.getElementById('additionalForm').addEventListener('input', validateDemographicsForm);
    document.getElementById('additionalForm').addEventListener('change', validateDemographicsForm);
    
    // Initialize state on load
    validateDemographicsForm();
    
    // --- Step 3: Task > Test ---
    document.getElementById('startTaskButton').addEventListener('click', nextSlideThird);
    async function nextSlideThird() {
        fullTaskStart = new Date().toISOString();
        console.log("▶️ Full task started at:", fullTaskStart); // TimeRecord

        document.getElementById('taskScreen').style.display = 'none';
        document.body.scrollTop = 0;
        if (testType === 'select') {
            document.getElementById('selectTestScreen').style.display = 'flex';
            loadSelectTest(questionLanguages[0].languages);
        } else if (testType === 'slider') {
            document.getElementById('sliderTestScreen').style.display = 'flex';
            loadSliderTest(questionLanguages[0]['languages'][0]); // Pass the first selected language
        }
    }    

    // --- Step 4: Test Progression ---
    document.getElementById('nextTextButton').addEventListener('click', nextSlideFourth);
    function nextSlideFourth() {
        document.body.scrollTop = 0;
        if (testType === 'select') {
            
            // Add end time for the last task
            if (taskTimestamps.length > 0) {
                taskTimestamps[taskTimestamps.length - 1].end = new Date().toISOString();
                console.log(`✅ ${taskTimestamps.at(-1)?.round} ended at:`, taskTimestamps.at(-1)?.end); //TimeRecord
            }

            saveSelectedLanguages();
            if (selectTestRounds < 10) {
                loadSelectTest(questionLanguages[selectTestRounds].languages);
                return;
            }
        } else if (testType === 'slider') {
            saveSliderTestData();
            if (sliderTestRounds < 8) {
                // In the case of slider test questionLanguages consists of two arrays containing 4 languages each
                loadSliderTest(questionLanguages[sliderTestRounds >= 4 ? 1 : 0]['languages'][sliderTestRounds % 4]); // Alternate between the two languages
                return;
            }
        }
        fullTaskEnd = new Date().toISOString();
        console.log("🛑 Full task ended at:", fullTaskEnd); // TimeRecord


        document.getElementById(testType === 'slider' ? 'sliderTestScreen' : 'selectTestScreen').style.display = 'none';
        // submit to firebase happened here
        submitDataToFirebase();
        document.getElementById('thankYouScreen').style.display = 'flex';
    }

    // --- Slider Resets ---
    function initializeSliderResets() {
        const sliders = [
            { id: "lineHeight", defaultValue: 1.2 },
            { id: "wordSpacing", defaultValue: 0 },
            { id: "letterSpacing", defaultValue: 0 }
        ];
        sliders.forEach(sliderConfig => {
            const slider = document.getElementById(sliderConfig.id);
            const valueDisplay = document.getElementById(`${sliderConfig.id}Value`);
            const resetButton = document.getElementById(`${sliderConfig.id}Reset`);
            resetButton.addEventListener("click", () => {
                slider.value = sliderConfig.defaultValue;
                valueDisplay.textContent = sliderConfig.defaultValue;
                applySliderStyles(sliderConfig.id, sliderConfig.defaultValue);
            });
        });
    }
    function applySliderStyles(sliderId, value) {
        const sliderTestContent = document.getElementById('sliderTestContent');
        if (!sliderTestContent) return;
        switch (sliderId) {
            case "lineHeight":
                sliderTestContent.style.lineHeight = value;
                break;
            case "wordSpacing":
                sliderTestContent.style.wordSpacing = value + "em";
                break;
            case "letterSpacing":
                sliderTestContent.style.letterSpacing = value + "em";
                break;
        }
    }
    initializeSliderResets();

    document.getElementById('nextSelectTestButton').addEventListener('click', nextSlideFourth);
});

// --- Translation loader and applier ---
function loadAndApplyTranslations(lang) {
    fetch(`${LANG_PATH}${lang}.json`)
        .then(res => {
            if (!res.ok) throw new Error('File not found');
            return res.json();
        })
        .then(data => {
            console.log("Loaded translation for:", lang, data);
            uiTranslations = data;
            applyUITranslations();
            // Show welcome, hide selector
            document.getElementById('languageSelectorScreen').style.display = 'none';
            document.getElementById('welcomeScreen').style.display = 'flex';
            document.body.scrollTop = 0;
        })
        .catch(e => {
            console.error("Translation file error:", e);
            if (lang !== 'English') loadAndApplyTranslations('English');
        });
}

function applyUITranslations() {
    if (!uiTranslations.welcome) return;
    const t = uiTranslations;

    // Language selector screen
    document.querySelector('label[for="uiLanguageSelector"]').childNodes[0].textContent = t.languageScreen.nativeLabel + ' ';
    document.getElementById('uiLanguageNextBtn').innerText = t.languageScreen.next;

    // Welcome screen
    document.querySelector('.smallTextTitle').innerText = t.welcome.title;
    document.querySelector('.smallText').innerText = t.welcome.phd;

    const welcomePs = document.querySelectorAll('#welcomeScreen p');
    if (welcomePs.length > 0) welcomePs[0].innerText = t.welcome.intro1;
    if (welcomePs.length > 1) welcomePs[1].innerText = t.welcome.intro2;
    if (welcomePs.length > 2) welcomePs[2].innerText = t.welcome.summary;
    if (welcomePs.length > 3) welcomePs[3].innerText = t.welcome.participation;
    if (welcomePs.length > 4) welcomePs[4].innerText = t.welcome.advice;
    if (welcomePs.length > 5) welcomePs[5].innerText = t.welcome.ethics;
    if (welcomePs.length > 6) welcomePs[6].innerText = t.welcome.smallText;

    // Terms checkbox
    const termsLabel = document.querySelector('.termsConditionsBox label');
    if (termsLabel && termsLabel.childNodes.length >= 2) {
        termsLabel.childNodes[2].textContent = " " + t.welcome.checkbox;
    }
    document.getElementById('termsConditionsLink').innerText = t.welcome.termsLink;
    document.getElementById('nextSlideFirst').innerText = t.welcome.proceed;

    // Terms popup
    document.querySelector('#termsConditionsPopup h1').innerText = t.terms.title;
    document.querySelectorAll('#termsConditionsPopup h2')[0].innerText = t.terms.purposeTitle;
    document.querySelectorAll('#termsConditionsPopup p')[0].innerText = t.terms.purposeText;
    // Requirements Title
    document.querySelectorAll('#termsConditionsPopup h2')[1].innerText = t.terms.requirementsTitle;
    // Requirements Block
    const requirementsBlock = document.getElementById('termsRequirementsBlock');
    if (requirementsBlock) {
        const paragraphs = requirementsBlock.querySelectorAll('p');
        const listItems = requirementsBlock.querySelectorAll('ul li');
        if (paragraphs[0]) paragraphs[0].innerText = t.terms.requirementsText;
        if (listItems[0]) listItems[0].innerText = t.terms.requirementsList1;
        if (listItems[1]) listItems[1].innerText = t.terms.requirementsList2;
        if (listItems[2]) listItems[2].innerText = t.terms.requirementsList3;
    }
    document.querySelectorAll('#termsConditionsPopup h2')[2].innerText = t.terms.contactTitle;
    document.querySelectorAll('#termsConditionsPopup p')[2].innerText = t.terms.contactText;
    document.querySelectorAll('#termsConditionsPopup h2')[3].innerText = t.terms.complaintsTitle;
    document.querySelectorAll('#termsConditionsPopup p')[3].innerText = t.terms.complaintsText;
    document.querySelectorAll('#termsConditionsPopup p')[4].innerText = t.terms.complaintsRecom;
    document.getElementById('closeTermsButton').innerText = t.terms.close;

    // Demographics
    document.querySelector('#demographicsScreen h2').innerText = t.form.title;
    document.querySelector('#demographicsScreen p').innerText = t.form.gdpr;
    document.getElementById('nextDemographicsButton').innerText = t.form.next;
    document.getElementById('moreLanguage').innerText = t.form.addLang;

    // Language selector labels
    const nativeLangLabel = document.getElementById('nativeLanguagesContainer');
    if (nativeLangLabel && nativeLangLabel.childNodes.length > 0) {
        nativeLangLabel.childNodes[0].textContent = t.form.nativeLanguagesLabel;
    }

    
    // Native language options
    const nativeLangSelect = document.getElementById('nativeLanguage');
    if (nativeLangSelect && t.languages) {
        const options = nativeLangSelect.querySelectorAll('option');
        options.forEach(option => {
            const lang = option.value;  
            const langLookup = lang.toLowerCase();
            option.textContent = t.languages[langLookup] || lang;
        });

        // filter out other
        const filteredOptions = Array.from(options).filter((option) => { 
            return option.value !== 'Other'; 
        });
        // Sort options alphabetically after translation
        const sortedOptions = filteredOptions.sort((a, b) => {  
            return a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase());
        });
        nativeLangSelect.innerHTML = '';
        sortedOptions.forEach(option => nativeLangSelect.appendChild(option));

        // append other on the end
        const otherOption = document.createElement('option');
        otherOption.value = 'Other';
        otherOption.textContent = t.languages['other'] || 'Other';
        nativeLangSelect.appendChild(otherOption);
    }
    else {
        console.warn(`Translation missing for native language selection.`);
    }

    // Other language options (uses same translations as above)
    const otherLangSelect = document.getElementById('otherLanguage1');
    if (otherLangSelect && t.languages) {
        const options = otherLangSelect.querySelectorAll('option');
        options.forEach(option => {
            const lang = option.value;  
            const langLookup = lang.toLowerCase();
            option.textContent = t.languages[langLookup] || lang;
        });

        // filter out other
        const filteredOptions = Array.from(options).filter((option) => { 
            return option.value !== 'Other'; 
        });
        // Sort options alphabetically after translation
        const sortedOptions = filteredOptions.sort((a, b) => {  
            return a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase());
        });
        otherLangSelect.innerHTML = '';
        sortedOptions.forEach(option => otherLangSelect.appendChild(option));

        // append other on the end
        const otherOption = document.createElement('option');
        otherOption.value = 'Other';    
        otherOption.textContent = t.languages['other'] || 'Other';
        otherLangSelect.appendChild(otherOption);
    }
    else {
        console.warn(`Translation missing for native language selection.`);
    }

    const otherLangLabel = document.getElementById('otherLanguagesContainer');
    if (otherLangLabel && otherLangLabel.childNodes.length > 0) {
        otherLangLabel.childNodes[0].textContent = t.form.otherLanguagesLabel;
    }

        // --- Book Reading Section ---
        const booksLabel = document.querySelector('label.labelFlexColumnHorizontal');
        if (booksLabel) {
            booksLabel.childNodes[0].textContent = t.form.booksRead + ' ';
            booksLabel.querySelector('input[name="booksRead"]').placeholder = t.form.booksNUmberSelectorPlaceholder;
            booksLabel.childNodes[2].textContent = ' ' + t.form.booksTime + ' ';
            const timeOptions = booksLabel.querySelectorAll('select[name="booksTimeframe"] option');
            if (timeOptions.length >= 3) {
                timeOptions[0].innerText = t.form.booksTimeframeWeek;
                timeOptions[1].innerText = t.form.booksTimeframeMonth;
                timeOptions[2].innerText = t.form.booksTimeframeYear;
            }
        }
    
        // --- Academic Reading ---
        const academicLabel = Array.from(document.querySelectorAll('#additionalForm label'))
            .find(l => l.textContent.includes("academic texts"));
        if (academicLabel) {
            academicLabel.childNodes[0].textContent = t.form.academicReadingLabel;
            const radios = academicLabel.querySelectorAll('label');
            radios[0].lastChild.textContent = ' ' + t.form.academicReadingYes;
            radios[1].lastChild.textContent = ' ' + t.form.academicReadingNo;
            
        }
    
        // --- Everyday Reading ---
        const everydayLabel = Array.from(document.querySelectorAll('#additionalForm label'))
            .find(l => l.textContent.includes("I read everyday"));
        if (everydayLabel) {
            everydayLabel.childNodes[0].textContent = t.form.everydayReadingLabel;
            const checkboxes = everydayLabel.querySelectorAll('label');
            checkboxes[0].lastChild.textContent = ' ' + t.form.news;
            checkboxes[1].lastChild.textContent = ' ' + t.form.social;
            checkboxes[2].childNodes[2].textContent = ' ' + t.form.other;
            const otherInput = checkboxes[2].querySelector('input[type="text"]');
            otherInput.placeholder = t.form.otherSelectorPlaceholder;
        }
    
        // --- Graphic Design ---
        const graphicLabel = Array.from(document.querySelectorAll('#additionalForm label'))
            .find(l => l.textContent.includes("graphic design"));
        if (graphicLabel) {
            graphicLabel.childNodes[0].textContent = t.form.graphicDesignLabel;
            const radios = graphicLabel.querySelectorAll('label');
            radios[0].lastChild.textContent = ' ' + t.form.graphicDesignYes;
            radios[1].lastChild.textContent = ' ' + t.form.graphicDesignNo;
        }
    
        // Ensure "Next" button is translated
        const demographicsNext = document.getElementById('nextDemographicsButton');
        if (demographicsNext) demographicsNext.innerText = t.form.next;

    const ageLabel = Array.from(document.querySelectorAll('#additionalForm label')).find(l => l.innerText.includes("What is your age"));
    if (ageLabel) ageLabel.childNodes[0].textContent = t.form.ageLabel;
    const ageOptions = ageLabel.querySelectorAll('option');
    if (ageOptions.length >= 4) {
        ageOptions[0].innerText = t.form.age18_25;
        ageOptions[1].innerText = t.form.age26_40;
        ageOptions[2].innerText = t.form.age41_65;
        ageOptions[3].innerText = t.form.age66plus;
    }

    // Slider Test
    document.getElementById('slidersTitle').innerText = t.sliders.title;
    document.querySelector('label[for="lineHeight"]').innerText = t.sliders.lineHeight;
    document.querySelector('label[for="wordSpacing"]').innerText = t.sliders.wordSpacing;
    document.querySelector('label[for="letterSpacing"]').innerText = t.sliders.letterSpacing;
    document.getElementById('cleanViewButton').innerText = t.sliders.cleanView;
    document.getElementById('proceedPopupButton').innerText = t.sliders.proceed;

    // Reason popup
    document.querySelector('#reasonChangePopup p').innerText = t.reasonPopup.prompt;
    document.querySelector('[name="reasonChangeInput"]').placeholder = t.reasonPopup.placeholder;
    document.getElementById('nextTextButton').innerText = t.reasonPopup.proceed;

    // Task intro
    const taskContent = document.getElementById('taskTextContent');
    // Clear any existing content inside the div
    taskContent.innerHTML = '';
    // Choose instruction set based on test type
    let instructions = testType === 'slider'
        ? [t.task.sliderInstruction, t.task.sliderInstruction2]
        : [t.task.selectInstruction, t.task.selectInstruction2];

    sliderInstruction = t.task.sliderInstruction || sliderInstruction;
    sliderInstruction2 = t.task.sliderInstruction2 || sliderInstruction2;
    selectInstruction = t.task.selectInstruction || selectInstruction;
    selectInstruction2 = t.task.selectInstruction2 || selectInstruction2;

    // Create and append each <p> dynamically
    //instructions.forEach(text => {
    //    const p = document.createElement('p');
    //    p.innerText = text;
    //    taskContent.appendChild(p);
    //});

    document.getElementById('startTaskButton').innerText = t.task.start;

    // Select test
    document.querySelector('#selectTestScreen h2').innerText = t.selectTest.title;
    document.getElementById('nextSelectTestButton').innerText = t.selectTest.next;

    // Thank you screen
    document.querySelector('#thankYouScreen h2').innerText = t.thankYou.title;
}


// --- The rest of your logic (Select/Slider Test functions, unchanged) ---

function loadSelectTest(languages) {
    selectTestRounds++;
    taskTimestamps.push({
        round: `${selectTestRounds}`,
        start: new Date().toISOString()
    });
    console.log(`🆕 Select Task-${selectTestRounds} started at:`, taskTimestamps.at(-1)?.start); // TimeRecord

    if (Object.keys(textData).length === 0) {
        console.error("textData is empty. Cannot load select test.");
        return;
    }

    let selectedLanguages = new Set();
    let selectedTexts = [];

    for (let lang of languages) {
        if (selectedLanguages.size >= 4) break;
        if (selectedLanguages.has(lang)) continue;
        let availableTexts = textData[lang].map((text, i) => ({ text, index: i })).filter(item => !usedTexts.has(`${lang}-${item.index}`));
        if (availableTexts.length > 0) {
            let randomSelection = availableTexts[Math.floor(Math.random() * availableTexts.length)];
            usedTexts.add(`${lang}-${randomSelection.index}`);
            selectedLanguages.add(lang);
            selectedTexts.push({ lang, text: randomSelection.text, index: randomSelection.index });
            if (availableTexts.length === 1) {
                // Remove all usedTexts except the last added one to free up texts for future rounds, but only for this language
                usedTexts = new Set(Array.from(usedTexts).filter(item => !item.startsWith(`${lang}-`) || item !== `${lang}-${randomSelection.index}`));
            }
        }   
    }

    selectedTexts.forEach((selection, index) => {
        let textDiv = document.getElementById(`textLanguage${index + 1}`);
        if (!textDiv) {
            console.error(`Element textLanguage${index + 1} not found`);
            return;
        }
        textDiv.innerText = selection.text;
        textDiv.setAttribute("data-language", selection.lang);
        textDiv.setAttribute("data-index", selection.index + 1);
        textDiv.classList.remove("selectedLanguageStyle");

        textDiv.replaceWith(textDiv.cloneNode(true));
        textDiv = document.getElementById(`textLanguage${index + 1}`);
        textDiv.addEventListener("click", function () {
            toggleSelection(this);
        });
    });
}

function toggleSelection(div) {
    // If already selected, always allow deselect
    if (div.classList.contains("selectedLanguageStyle")) {
        div.classList.remove("selectedLanguageStyle");
        return;
    }
    // Count currently selected cards
    const selected = document.querySelectorAll('.selectText.selectedLanguageStyle').length;
    if (selected < 2) {
        div.classList.add("selectedLanguageStyle");
    } else {
        // Optionally, give feedback to the user
        // alert("You can only select 2 cards.");
    }
}

function loadSliderTest(language) {
    sliderTestRounds++;
    taskTimestamps.push({
        round: `${sliderTestRounds}`,
        start: new Date().toISOString()
    });
    console.log(`🆕 Slider Task-${sliderTestRounds} started at:`, taskTimestamps.at(-1)?.start); // TimeRecord


    if (Object.keys(textData).length === 0) {
        console.error("textData is empty. Cannot load slider test.");
        return;
    }

    let availableTexts = textData[language].map((text, i) => ({ text, index: i })).filter(item => !usedTexts.has(`${language}-${item.index}`));
    if (availableTexts.length === 0) {
        console.error(`No available texts left for ${language}`);
        document.getElementById('sliderTestContent').innerText = "Unfortunately, there are no more texts available!";
        return;
    }
    let randomSelection = availableTexts[Math.floor(Math.random() * availableTexts.length)];
    usedTexts.add(`${language}-${randomSelection.index}`);
    document.getElementById('sliderTestContent').innerText = randomSelection.text;
    document.getElementById('sliderTestContent').setAttribute("data-language", language);
    document.getElementById('sliderTestContent').setAttribute("data-index", randomSelection.index + 1);
}

// --- Slider value update ---
function updateSliders() {
    let lineHeight = document.getElementById('lineHeight');
    let wordSpacing = document.getElementById('wordSpacing');
    let letterSpacing = document.getElementById('letterSpacing');
    let lineHeightValue = document.getElementById('lineHeightValue');
    let wordSpacingValue = document.getElementById('wordSpacingValue');
    let letterSpacingValue = document.getElementById('letterSpacingValue');
    let sliderTestContent = document.getElementById('sliderTestContent');
    lineHeightValue.innerText = lineHeight.value;
    wordSpacingValue.innerText = wordSpacing.value;
    letterSpacingValue.innerText = letterSpacing.value;
    sliderTestContent.style.lineHeight = lineHeight.value;
    sliderTestContent.style.wordSpacing = wordSpacing.value + "px";
    sliderTestContent.style.letterSpacing = letterSpacing.value + "px";
}
document.getElementById('lineHeight').addEventListener('input', updateSliders);
document.getElementById('wordSpacing').addEventListener('input', updateSliders);
document.getElementById('letterSpacing').addEventListener('input', updateSliders);

document.getElementById('proceedPopupButton').addEventListener('click', openReasonChangePopup);
function openReasonChangePopup() {

    // Add end time for the last task
    if (taskTimestamps.length > 0) {
        taskTimestamps[taskTimestamps.length - 1].end = new Date().toISOString();
        console.log(`✅ ${taskTimestamps.at(-1)?.round} ended at:`, taskTimestamps.at(-1)?.end); //TimeRecord
    }
    
    document.getElementById('reasonChangePopup').style.display = 'flex';
}
document.getElementById('cleanViewButton').addEventListener('click', clearViewToggle);
function clearViewToggle() {
    let elements = [
        document.getElementById('slidersTitle'),
        document.getElementById('slidersBox'),
        document.getElementById('proceedPopupButton'),
    ];
    elements.forEach(element => {
        if (element.style.opacity === '0') {
            element.style.opacity = '1';
            document.getElementById('cleanViewButton').style.opacity = '1';
        } else {
            element.style.opacity = '0';
            document.getElementById('cleanViewButton').style.opacity = '.1';
        }
    });
}

// --- Data collection, save, submit (unchanged) ---
function collectDemographicsData() {
    let formData = {};
    const form = document.getElementById('additionalForm');
    const elements = form.elements;
    
    for (let element of elements) {
        if (!element.name) continue;
    
        // Handle multiple otherLanguages
        if (element.name.startsWith('otherLanguage')) {
            if (!formData.otherLanguages) {
                formData.otherLanguages = [];
            }
            if (element.value) {
                formData.otherLanguages.push(element.value);
            }
        }
    
        // Handle other inputs
        else if (element.type === 'checkbox' || element.type === 'radio') {
            if (element.checked) {
                if (!formData[element.name]) {
                    formData[element.name] = [];
                }
                formData[element.name].push(element.value);
            }
        } else if (element.type === 'select-one' || element.type === 'text' || element.type === 'number') {
            formData[element.name] = element.value || null;
        }
    }
    
    // Add native language separately
    const nativeLangSelect = document.getElementById('nativeLanguage');
    if (nativeLangSelect) {
        formData.nativeLanguage = nativeLangSelect.value || null;
    }
    
    sessionStorage.setItem('demographicsData', JSON.stringify(formData));
    return formData;
}

function saveSelectedLanguages() {
    let selected = [];
    document.querySelectorAll('.selectText').forEach(div => {
        if (div.classList.contains("selectedLanguageStyle")) {
            selected.push({
                language: div.getAttribute("data-language"),
                index: div.getAttribute("data-index")
            });
        }
    });
    results.push({ round: selectTestRounds, selections: selected, all_languages: questionLanguages.filter(q => q.round === selectTestRounds)[0].languages });
}

function saveSliderTestData() {
    let language = document.getElementById('sliderTestContent').getAttribute("data-language");
    let index = document.getElementById('sliderTestContent').getAttribute("data-index");
    let lineHeight = document.getElementById('lineHeight').value;
    let wordSpacing = document.getElementById('wordSpacing').value;
    let letterSpacing = document.getElementById('letterSpacing').value;
    let reasonText = document.querySelector('[name="reasonChangeInput"]').value;
    let sliderData = {
        round: sliderTestRounds,
        language,
        index,
        lineHeight,
        wordSpacing,
        letterSpacing,
        reasonText
    };
    results.push(sliderData);
    document.querySelector('[name="reasonChangeInput"]').value = "";
    document.getElementById('lineHeight').value = "1.2";
    document.getElementById('wordSpacing').value = "0";
    document.getElementById('letterSpacing').value = "0";
    document.getElementById('lineHeightValue').innerText = "1.2";
    document.getElementById('wordSpacingValue').innerText = "0";
    document.getElementById('letterSpacingValue').innerText = "0";
    const sliderTestContent = document.getElementById('sliderTestContent');
    sliderTestContent.style.lineHeight = ""
    sliderTestContent.style.wordSpacing = ""
    sliderTestContent.style.letterSpacing = ""
    document.getElementById('reasonChangePopup').style.display = 'none';
}

// --- Firebase submit ---
function sendSurveyResponse(data) {
    fetch(`https://comfort-read.isoquac.net/submitSurvey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        console.log('✅ Survey response submitted successfully:', result);
    })
    .catch(error => {
        console.error('❌ Error submitting survey response:', error);
    });
}

function submitDataToFirebase() {
    const demographicsData = JSON.parse(sessionStorage.getItem('demographicsData')) || {};
    const selectedUILanguage = sessionStorage.getItem('selectedUILanguage') || currentLang;
    const testData = {
        testType: testType,
        uiLanguage: selectedUILanguage,
        fullTaskStart,
        fullTaskEnd,
        taskTimestamps,
        viewportMetrics: getViewportMetrics()
    };   
    if (testType === 'select') {
        testData.selectedLanguages = results;
    } else if (testType === 'slider') {
        testData.sliderSettings = results;
    }
    if (participantId) {
        const finalData = {participantId: participantId, ...demographicsData, ...testData };
        sendSurveyResponse(finalData);
    }
}

async function loadLanguageJson() {
    try {
        const response = await fetch('languages.json');
        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`✅ Language JSON retrieved successfully:`, data);
        return data;
    } catch (error) {
        console.error('❌ Error retrieving language JSON: ', error);
    }
}