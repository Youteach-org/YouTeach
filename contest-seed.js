export const reportedSpeechContest = {
  id: "reported-speech-demo",
  title: "100 Students Said: Reported Speech",
  topic: "Reported Speech",
  defaults: {
    strikeLimit: 2,
    roundDurationMs: 300000,
    responseDurationMs: 10000
  },
  rounds: [
    {
      id: "round-1",
      title: "Statements, questions, and commands",
      multiplier: 1,
      activities: [
        {
          id: "rs-01",
          prompt: "Maya said, “I am studying for the exam.”",
          modelAnswer: "Maya said that she was studying for the exam.",
          acceptedAlternatives: ["Maya said she was studying for the exam."],
          explanation: "Backshift the present continuous to the past continuous and change I to she.",
          teacherNotes: "Accept omission of that.",
          difficulty: "easy",
          basePoints: 10,
          reportingFunction: "statement",
          studyReference: "Connectivity 5: reported statements"
        },
        {
          id: "rs-02",
          prompt: "Leo said to Ana, “I will call you tomorrow.”",
          modelAnswer: "Leo told Ana that he would call her the next day.",
          acceptedAlternatives: ["Leo told Ana he would call her the following day."],
          explanation: "Use told with an object; will becomes would and tomorrow changes.",
          teacherNotes: "Do not accept told that without Ana.",
          difficulty: "easy",
          basePoints: 10,
          reportingFunction: "statement",
          studyReference: "Connectivity 5: reporting verbs and time changes"
        },
        {
          id: "rs-03",
          prompt: "The teacher asked, “Have you finished the assignment?”",
          modelAnswer: "The teacher asked whether we had finished the assignment.",
          acceptedAlternatives: ["The teacher asked if we had finished the assignment."],
          explanation: "Use if/whether and statement word order for a yes/no question.",
          teacherNotes: "Adapt the pronoun to the student’s context.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "yes-no question",
          studyReference: "Connectivity 5: reported questions"
        },
        {
          id: "rs-04",
          prompt: "Sara asked Tom, “Where did you put my keys?”",
          modelAnswer: "Sara asked Tom where he had put her keys.",
          acceptedAlternatives: [],
          explanation: "Keep the question word, use statement order, and backshift past simple.",
          teacherNotes: "No auxiliary did in the reported clause.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "wh-question",
          studyReference: "Connectivity 5: reported questions"
        },
        {
          id: "rs-05",
          prompt: "Dad said to me, “Turn off the lights.”",
          modelAnswer: "Dad told me to turn off the lights.",
          acceptedAlternatives: ["Dad asked me to turn off the lights."],
          explanation: "Report a command with told + object + to-infinitive.",
          teacherNotes: "Asked is acceptable if the original is interpreted as a request.",
          difficulty: "easy",
          basePoints: 10,
          reportingFunction: "command",
          studyReference: "Connectivity 5: reported commands and requests"
        },
        {
          id: "rs-06",
          prompt: "Nina said to us, “Don’t open the window.”",
          modelAnswer: "Nina warned us not to open the window.",
          acceptedAlternatives: ["Nina told us not to open the window."],
          explanation: "Use not to-infinitive for a negative command.",
          teacherNotes: "Warned better expresses the function.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "warning",
          studyReference: "Connectivity 5: reporting verbs"
        },
        {
          id: "rs-07",
          prompt: "Marco said, “I can help you today.”",
          modelAnswer: "Marco said that he could help me that day.",
          acceptedAlternatives: ["Marco said he could help me that day."],
          explanation: "Can becomes could; today becomes that day.",
          teacherNotes: "Accept pronoun changes that fit the speaker’s context.",
          difficulty: "easy",
          basePoints: 10,
          reportingFunction: "statement",
          studyReference: "Connectivity 5: modal and time changes"
        },
        {
          id: "rs-08",
          prompt: "The coach said to Julia, “You should rest.”",
          modelAnswer: "The coach advised Julia to rest.",
          acceptedAlternatives: ["The coach told Julia that she should rest."],
          explanation: "Advise can be followed by object + to-infinitive.",
          teacherNotes: "Use this item to contrast advise and say.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "advice",
          studyReference: "Connectivity 5: additional reporting verbs"
        },
        {
          id: "rs-09",
          prompt: "Ben said, “I didn’t break the tablet.”",
          modelAnswer: "Ben denied breaking the tablet.",
          acceptedAlternatives: ["Ben denied that he had broken the tablet."],
          explanation: "Deny is commonly followed by a gerund or a that-clause.",
          teacherNotes: "Do not accept denied to break.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "denial",
          studyReference: "Connectivity 5: verb patterns after reporting verbs"
        },
        {
          id: "rs-10",
          prompt: "Emma said, “I’ll definitely finish the project.”",
          modelAnswer: "Emma promised to finish the project.",
          acceptedAlternatives: ["Emma promised that she would finish the project."],
          explanation: "Promise can be followed by a to-infinitive or a that-clause.",
          teacherNotes: "Emphasize the communicative function.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "promise",
          studyReference: "Connectivity 5: additional reporting verbs"
        }
      ]
    },
    {
      id: "round-2",
      title: "Reporting verbs and verb patterns",
      multiplier: 1,
      activities: [
        {
          id: "rs-11",
          prompt: "Liam said, “Yes, I copied the file.”",
          modelAnswer: "Liam admitted copying the file.",
          acceptedAlternatives: ["Liam admitted that he had copied the file."],
          explanation: "Admit is followed by a gerund or a that-clause.",
          teacherNotes: "Do not accept admitted to copy.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "admission",
          studyReference: "Connectivity 5: reporting verb patterns"
        },
        {
          id: "rs-12",
          prompt: "Mom said to Carla, “Remember to take your medicine.”",
          modelAnswer: "Mom reminded Carla to take her medicine.",
          acceptedAlternatives: [],
          explanation: "Remind takes an object followed by a to-infinitive.",
          teacherNotes: "The object is required.",
          difficulty: "easy",
          basePoints: 10,
          reportingFunction: "reminder",
          studyReference: "Connectivity 5: additional reporting verbs"
        },
        {
          id: "rs-13",
          prompt: "Omar said, “Let’s study together.”",
          modelAnswer: "Omar suggested studying together.",
          acceptedAlternatives: ["Omar suggested that we study together.", "Omar suggested that we should study together."],
          explanation: "Suggest takes a gerund or a that-clause, not object + to-infinitive.",
          teacherNotes: "Do not accept suggested us to study.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "suggestion",
          studyReference: "Connectivity 5: suggestions in reported speech"
        },
        {
          id: "rs-14",
          prompt: "Eva said to Luis, “I’m sorry I lost your notebook.”",
          modelAnswer: "Eva apologized to Luis for losing his notebook.",
          acceptedAlternatives: [],
          explanation: "Apologize uses to + person and for + gerund.",
          teacherNotes: "Check both prepositions.",
          difficulty: "hard",
          basePoints: 10,
          reportingFunction: "apology",
          studyReference: "Connectivity 5: reporting verb patterns"
        },
        {
          id: "rs-15",
          prompt: "The guide said to us, “Don’t touch that wire because it is dangerous.”",
          modelAnswer: "The guide warned us not to touch that wire because it was dangerous.",
          acceptedAlternatives: [],
          explanation: "Warn takes object + not to-infinitive.",
          teacherNotes: "Accept the demonstrative appropriate to the classroom context.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "warning",
          studyReference: "Connectivity 5: warnings"
        },
        {
          id: "rs-16",
          prompt: "I said to Paul, “You should apply for the scholarship.”",
          modelAnswer: "I encouraged Paul to apply for the scholarship.",
          acceptedAlternatives: ["I advised Paul to apply for the scholarship."],
          explanation: "Encourage and advise take object + to-infinitive.",
          teacherNotes: "Either verb matches the intended function.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "encouragement",
          studyReference: "Connectivity 5: additional reporting verbs"
        },
        {
          id: "rs-17",
          prompt: "The suspect said, “I was not at the store last night.”",
          modelAnswer: "The suspect claimed that he had not been at the store the previous night.",
          acceptedAlternatives: ["The suspect claimed he had not been at the store the night before."],
          explanation: "Claim introduces an assertion; backshift and change the time expression.",
          teacherNotes: "Said is grammatical, but claimed better expresses the function.",
          difficulty: "hard",
          basePoints: 10,
          reportingFunction: "claim",
          studyReference: "Connectivity 5: nuanced reporting verbs"
        },
        {
          id: "rs-18",
          prompt: "Rita said to me, “Please, please help me.”",
          modelAnswer: "Rita begged me to help her.",
          acceptedAlternatives: ["Rita asked me to help her."],
          explanation: "Beg takes object + to-infinitive and expresses urgency.",
          teacherNotes: "Asked is acceptable but less precise.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "request",
          studyReference: "Connectivity 5: requests"
        },
        {
          id: "rs-19",
          prompt: "Carlos said to Ana, “You stole my idea.”",
          modelAnswer: "Carlos accused Ana of stealing his idea.",
          acceptedAlternatives: [],
          explanation: "Accuse takes object + of + gerund.",
          teacherNotes: "Do not accept accused Ana to steal.",
          difficulty: "hard",
          basePoints: 10,
          reportingFunction: "accusation",
          studyReference: "Connectivity 5: reporting verb patterns"
        },
        {
          id: "rs-20",
          prompt: "The manager said, “You may leave early today.”",
          modelAnswer: "The manager allowed us to leave early that day.",
          acceptedAlternatives: ["The manager said that we could leave early that day."],
          explanation: "Allow takes object + to-infinitive; may can become could.",
          teacherNotes: "Adapt the object pronoun to the responding student’s context.",
          difficulty: "medium",
          basePoints: 10,
          reportingFunction: "permission",
          studyReference: "Connectivity 5: permission in reported speech"
        }
      ]
    }
  ]
};

export function getActivityById(contest, activityId) {
  for (const round of contest.rounds || []) {
    const activity = (round.activities || []).find((item) => item.id === activityId);
    if (activity) return activity;
  }
  return null;
}
