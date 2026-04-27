const { Annotation } = require("@langchain/langgraph");
const { messagesStateReducer } = require("@langchain/langgraph");

const InterviewState = Annotation.Root({
    messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
    }),
    resumeContext: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    candidateName: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => "",
    }),
    questionCount: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => 0,
    }),
    phase: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => "intro",
    }),
    level: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => "fresher",
    }),
});

module.exports = { InterviewState };
