package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/joho/godotenv"
	"google.golang.org/api/option"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/db"
)

type Block struct {
	ID         string `json:"id"`
	Language   string `json:"language"`
	ResponseID string `json:"responseId"`
}

type Language struct {
	Name  string `json:"name"`
	Group string `json:"group"`
	In    bool   `json:"in"`
}

// type SurveyResponse struct {
// 	NativeLanguage       string `json:"nativeLanguage"`
// 	OtherLanguages       string `json:"otherLanguages"`
// 	AgeRange             string `json:"ageRange"`
// 	BooksRead            string `json:"booksRead"`
// 	BooksTimeframe       string `json:"booksTimeframe"`
// 	AcademicReading      string `json:"academicReading"`
// 	EverydayReading      string `json:"everydayReading"`
// 	EverydayReadingOther string `json:"everydayReadingOther"`
// 	ViewportMetrics      string `json:"viewportMetrics"`
// }

type ResponseCount struct {
	Quota int `json:"quota"`
	Count int `json:"count"`
}

var dbClient *db.Client
var languages = []Language{}
var languageMap = map[string]Language{}
var languageOptions map[string]interface{}

func initLanguages(filePath string) {
	// json structure: {"group": { "in": [list of languages], "out": [list of languages] }}
	// Read json file, parse it, and populate the maps, languages within "in" should be put it inGroupLanguages with value group, similarly for outGroupLanguages
	file, err := os.Open(filePath)
	if err != nil {
		log.Fatalf("Failed to open language group file: %v", err)
	}
	defer file.Close()

	var data map[string]map[string][]string
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&data); err != nil {
		log.Fatalf("Failed to decode language group JSON: %v", err)
	}

	for group, langLists := range data {
		for _, lang := range langLists["in"] {
			languages = append(languages, Language{Name: lang, Group: group, In: true})
		}
		for _, lang := range langLists["out"] {
			languages = append(languages, Language{Name: lang, Group: group, In: false})
		}
	}

	for _, lang := range languages {
		languageMap[lang.Name] = lang
	}

	log.Printf("Initialized %d languages from %s", len(languages), filePath)
}

func determineQuestionForLanguage(ctx context.Context, nativeLanguage string) (string, int, error) {
	// special case
	if nativeLanguage == "Other" {
		// assign to 1B directly
		return "1B", -1, nil
	}
	_, ok := languageMap[nativeLanguage]
	if !ok {
		return "", -1, fmt.Errorf("language not found: %s", nativeLanguage)
	}

	// Transaction will run on the per-language node: /quotas/<nativeLanguage>
	ref := dbClient.NewRef("/quotas/" + nativeLanguage)

	var chosenType string
	var newCount int = -1

	// Run an atomic transaction on the language node. We read the object (map)
	// and attempt to increment "1A" first, then "2A". If both are full, we fallback to "1B".
	err := ref.Transaction(ctx, func(node db.TransactionNode) (interface{}, error) {
		// Unmarshal current node into a map
		var m map[string]interface{}
		if err := node.Unmarshal(&m); err != nil {
			// if unmarshal fails or node missing, fallback
			log.Println("Unmarshal error or missing node:", err)
			chosenType = "1"
			newCount = -1
			return nil, nil
		}

		if m == nil {
			chosenType = "1"
			newCount = -1
			return nil, nil
		}

		// helper to read quota/count from an entry which may be map[string]interface{}
		tryEntry := func(key string) (canAssign bool, updated map[string]interface{}, nc int) {
			raw, exists := m[key]
			if !exists || raw == nil {
				return false, nil, -1
			}
			emap, ok := raw.(map[string]interface{})
			if !ok {
				return false, nil, -1
			}
			// JSON numbers are float64 when decoded into interface{}
			qf, _ := emap["quota"].(float64)
			cf, _ := emap["count"].(float64)
			quota := int(qf) // no quota found (1B case) -> 0
			count := int(cf)
			// treat quota <= 0 as unlimited
			if quota <= 0 || count < quota {
				// increment count
				emapCopy := map[string]interface{}{}
				for k, v := range emap {
					emapCopy[k] = v
				}
				emapCopy["count"] = float64(count + 1)
				nc := count + 1
				return true, emapCopy, nc
			}
			return false, nil, -1
		}

		// try "1A"
		if ok, updated, nc := tryEntry("1A"); ok {
			m["1A"] = updated
			chosenType = "1A"
			newCount = nc
			return m, nil
		}

		// try "2A"
		if ok, updated, nc := tryEntry("2A"); ok {
			m["2A"] = updated
			chosenType = "2A"
			newCount = nc
			return m, nil
		}

		// neither available -> fallback to special 1 variant (signal with nil count)
		chosenType = "1B"
		if ok, updated, nc := tryEntry("1B"); ok {
			m["1B"] = updated
			newCount = nc
			return m, nil
		}
		return m, nil
	})

	if err != nil {
		return "1B", -1, err
	}

	return chosenType, newCount, nil
}

// helper: shuffle slice of strings in-place
func shuffleStrings(a []string) {
	for i := range a {
		j := rand.Intn(i + 1)
		a[i], a[j] = a[j], a[i]
	}
}

// buildLanguageRounds constructs the response payload of rounds based on the question type.
func buildLanguageRounds(question, nativeLanguage string, count int) (interface{}, error) {
	// build map group -> []inLanguages
	groupMap := map[string][]string{}
	for _, lang := range languageMap {
		if !lang.In {
			continue
		}
		groupMap[lang.Group] = append(groupMap[lang.Group], lang.Name)
	}

	// helper to pick n random distinct from slice excluding a set
	pickRandomExcluding := func(candidates []string, n int, exclude map[string]bool) []string {
		pool := []string{}
		for _, s := range candidates {
			if exclude != nil && exclude[s] {
				continue
			}
			pool = append(pool, s)
		}
		if len(pool) == 0 {
			return []string{}
		}
		// shuffle pool
		shuffleStrings(pool)
		if n >= len(pool) {
			return pool
		}
		return pool[:n]
	}

	type Round struct {
		Round     int      `json:"round"`
		Languages []string `json:"languages"`
	}

	var rounds []Round
	groups := make([]string, 0, len(groupMap))
	for g := range groupMap {
		groups = append(groups, g)
	}

	switch question {
	case "1A":
		// Use precomputed 1A from languageOptions: languageOptions[nativeLanguage]["1A"][count]
		nlOptRaw, ok := languageOptions[nativeLanguage]
		if !ok {
			return nil, fmt.Errorf("language options missing for native language: %s", nativeLanguage)
		}
		nlOptMap, ok := nlOptRaw.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid language options format for %s", nativeLanguage)
		}

		oneARaw, ok := nlOptMap["1A"]
		if !ok {
			return nil, fmt.Errorf("1A entries not found for language options of %s", nativeLanguage)
		}
		oneASlice, ok := oneARaw.([]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid 1A structure for %s", nativeLanguage)
		}

		if len(oneASlice) == 0 {
			return nil, fmt.Errorf("no 1A entries available for %s", nativeLanguage)
		}
		if count < 0 {
			return nil, fmt.Errorf("invalid 1A index (%d) for %s", count, nativeLanguage)
		}
		// wrap index using modulus so counts larger than available options cycle
		idx := count % len(oneASlice)
		selected := oneASlice[idx]
		langListRaw, ok := selected.([]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid 1A entry at index %d for %s", count, nativeLanguage)
		}

		// Keep the order as provided for round 1
		firstRound := make([]string, 0, len(langListRaw))
		for _, v := range langListRaw {
			if s, ok := v.(string); ok {
				firstRound = append(firstRound, s)
			}
		}
		rounds = append(rounds, Round{Round: 1, Languages: firstRound})

		// Round 2 is a shuffled copy of round 1
		secondRound := make([]string, len(firstRound))
		copy(secondRound, firstRound)
		shuffleStrings(secondRound)
		rounds = append(rounds, Round{Round: 2, Languages: secondRound})

	case "2A":
		// Use precomputed 2A rounds from the in-memory languageOptions JSON.
		// Expected path: languageOptions[nativeLanguage]["2A"][count] -> []interface{} (10 rounds) where each round is []interface{} of strings
		nlOptRaw, ok := languageOptions[nativeLanguage]
		if !ok {
			return nil, fmt.Errorf("language options missing for native language: %s", nativeLanguage)
		}
		nlOptMap, ok := nlOptRaw.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid language options format for %s", nativeLanguage)
		}

		twoARaw, ok := nlOptMap["2A"]
		if !ok {
			return nil, fmt.Errorf("2A entries not found for language options of %s", nativeLanguage)
		}
		twoASlice, ok := twoARaw.([]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid 2A structure for %s", nativeLanguage)
		}

		if len(twoASlice) == 0 {
			return nil, fmt.Errorf("no 2A entries available for %s", nativeLanguage)
		}
		if count < 0 {
			return nil, fmt.Errorf("invalid 2A index (%d) for %s", count, nativeLanguage)
		}
		// wrap index using modulus so counts larger than available options cycle
		idx := count % len(twoASlice)
		selected := twoASlice[idx]
		roundsRaw, ok := selected.([]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid 2A entry at index %d for %s", count, nativeLanguage)
		}
		// Shuffle the order of the precomputed rounds themselves so the sequence
		// doesn't leak any predictable ordering that could give away answers.
		// roundsRaw is a []interface{} where each element is a round (list of strings).
		if len(roundsRaw) > 1 {
			rand.Shuffle(len(roundsRaw), func(i, j int) {
				roundsRaw[i], roundsRaw[j] = roundsRaw[j], roundsRaw[i]
			})
		}

		// Each element of roundsRaw should be a list of languages (4 strings). Convert, shuffle and append.
		for i, rRaw := range roundsRaw {
			langListRaw, ok := rRaw.([]interface{})
			if !ok {
				return nil, fmt.Errorf("invalid round format at index %d for %s", i, nativeLanguage)
			}
			langs := make([]string, 0, len(langListRaw))
			for _, v := range langListRaw {
				if s, ok := v.(string); ok {
					langs = append(langs, s)
				}
			}
			// shuffle the 4-language list like before
			shuffleStrings(langs)
			rounds = append(rounds, Round{Round: i + 1, Languages: langs})
		}

	case "1B":
		// same as 1A but select one random language from each group once, then shuffle for round 2
		firstRound := []string{}
		for _, g := range groups {
			exclude := map[string]bool{}
			// if nativeLanguage is In and belongs to this group, exclude it from selection
			if nl, ok := languageMap[nativeLanguage]; ok && nl.In && nl.Group == g {
				exclude[nativeLanguage] = true
			}
			one := pickRandomExcluding(groupMap[g], 1, exclude)
			if len(one) > 0 {
				firstRound = append(firstRound, one[0])
			}
		}
		rounds = append(rounds, Round{Round: 1, Languages: firstRound})
		secondRound := make([]string, len(firstRound))
		copy(secondRound, firstRound)
		shuffleStrings(secondRound)
		rounds = append(rounds, Round{Round: 2, Languages: secondRound})

	default:
		return nil, fmt.Errorf("unknown question type: %s", question)
	}

	resp := struct {
		QuestionType string  `json:"questionType"`
		Languages    []Round `json:"languages"`
	}{
		QuestionType: question,
		Languages:    rounds,
	}

	return resp, nil
}

func main() {
	initLanguages("languages.json")

	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	// load language options
	in, err := os.ReadFile("language_options.json")
	if err != nil {
		log.Fatalf("Failed to read language options file: %v", err)
	}
	if err := json.Unmarshal(in, &languageOptions); err != nil {
		log.Fatal("Failed to parse language options JSON:", err)
	}

	log.Print("Loaded language options.")

	firebase_url := os.Getenv("FIREBASE_URL")
	google_credential_file := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")

	ctx := context.Background()
	conf := &firebase.Config{
		DatabaseURL: firebase_url,
	}
	// Fetch the service account key JSON file contents
	opt := option.WithCredentialsFile(google_credential_file)

	// Initialize the app with a service account, granting admin privileges
	app, err := firebase.NewApp(ctx, conf, opt)
	if err != nil {
		log.Fatalln("Error initializing app:", err)
		return
	}

	client, err := app.Database(ctx)
	if err != nil {
		log.Fatalln("Error initializing database client:", err)
		return
	}

	dbClient = client
	log.Println("Firebase Realtime Database connected.")

	router := gin.Default()
	router.Use(cors.New(cors.Config{
		AllowOrigins: []string{
			"https://comfort-read.web.app",
			"https://comfort-read.firebaseapp.com",
			"http://localhost:8080",
			"http://127.0.0.1:8080",
		},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * 60 * 60,
	}))

	router.POST("/submitSurvey", func(c *gin.Context) {
		var result map[string]interface{}

		if err := c.ShouldBindJSON(&result); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid survey payload"})
			return
		}

		// a quick sanity check, check if it has uiLanguage field
		uiLanguage, ok := result["uiLanguage"].(string)
		if !ok || uiLanguage == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing or invalid fields"})
			return
		}

		// require participantId in the body to identify which DB record to update
		pid, ok := result["participantId"].(string)
		if !ok || pid == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing participantId in request body"})
			return
		}

		ref := dbClient.NewRef("/readabilityVisualComfort/" + pid)

		// check that the record exists
		var existing map[string]interface{}
		if err := ref.Get(c.Request.Context(), &existing); err != nil {
			log.Printf("Error reading existing survey response for %s: %v", pid, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read existing survey response"})
			return
		}
		if existing == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "participantId not found"})
			return
		}

		// update (merge) the existing record with fields from the request body
		if err := ref.Update(c.Request.Context(), result); err != nil {
			log.Printf("Error updating survey response for %s: %v", pid, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update survey response"})
			return
		}

		log.Printf("Updated survey response with ID: %s", pid)
		c.JSON(http.StatusOK, gin.H{"message": "Survey response updated", "id": pid})
	})

	router.POST("/submitScreeningSurvey", func(c *gin.Context) {
		var payload map[string]interface{}

		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
			return
		}

		// nativeLanguage must be provided in the request body
		nl, ok := payload["nativeLanguage"].(string)
		if !ok || nl == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing nativeLanguage field in body"})
			return
		}

		// determine question type and count
		questionType, count, err := determineQuestionForLanguage(c.Request.Context(), nl)
		if err != nil {
			log.Printf("Error determining question for language %s: %v", nl, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			return
		}

		log.Printf("Determined question %s for %s (count=%d)", questionType, nl, count)

		languageRounds, err := buildLanguageRounds(questionType, nl, count-1) // -1 because we work with indices in here
		if err != nil {
			log.Printf("Error building language rounds for %s/%s: %v", questionType, nl, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build language rounds"})
			return
		}

		// make new json object that includes languageRounds and count to add to payload
		lrMap := map[string]interface{}{}
		lrMap["questionType"] = questionType
		lrMap["languages"] = languageRounds
		if count >= 0 {
			lrMap["count"] = count
		}

		payload["languageRounds"] = lrMap

		// save to DB under /readabilityVisualComfort (same as /submitSurvey)
		ref := dbClient.NewRef("/readabilityVisualComfort")
		newRef, err := ref.Push(c.Request.Context(), payload)
		if err != nil {
			log.Printf("Error saving screening response: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save screening response"})
			return
		}

		log.Printf("Saved screening response with ID: %s", newRef.Key)

		// return the same languageRounds response as before, but include the DB key so client can update later
		c.JSON(http.StatusOK, gin.H{"id": newRef.Key, "languageRounds": languageRounds})
	})

	router.Run(":8090")
}
