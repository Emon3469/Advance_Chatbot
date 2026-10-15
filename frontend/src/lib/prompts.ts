export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  text: string;
}

export const PROMPTS: PromptTemplate[] = [
  {
    id: "summarize",
    title: "Summarize",
    category: "Writing",
    text: "Summarize the following text into 5 clear bullet points and a one-line takeaway:\n\n",
  },
  {
    id: "rewrite",
    title: "Rewrite professionally",
    category: "Writing",
    text: "Rewrite this to sound clear, confident and professional:\n\n",
  },
  {
    id: "explain",
    title: "Explain simply",
    category: "Learning",
    text: "Explain this concept simply, with an everyday analogy and a short example: ",
  },
  {
    id: "debug",
    title: "Debug my code",
    category: "Coding",
    text: "Find the bug in this code, explain the root cause and give the fixed version:\n\n",
  },
  {
    id: "review",
    title: "Code review",
    category: "Coding",
    text: "Review this code for correctness, performance and readability. List issues by severity:\n\n",
  },
  {
    id: "news",
    title: "Latest news",
    category: "Research",
    text: "Search the web and give me the latest news about ",
  },
  {
    id: "compare",
    title: "Compare options",
    category: "Research",
    text: "Compare these options in a table (pros, cons, cost, best for) and recommend one: ",
  },
  {
    id: "stock",
    title: "Stock snapshot",
    category: "Finance",
    text: "Get the current price of TSLA and give me a short snapshot of recent momentum.",
  },
  {
    id: "weather",
    title: "Weather check",
    category: "Daily",
    text: "What is the weather like right now in ",
  },
  {
    id: "doc-qa",
    title: "Ask my document",
    category: "Documents",
    text: "Using my uploaded document, answer: ",
  },
  {
    id: "email",
    title: "Cold email",
    category: "Outreach",
    text: "Write a short cold email to [role] at [company] about [offer]. Include two subject lines.",
  },
  {
    id: "plan",
    title: "Study plan",
    category: "Learning",
    text: "Create a 4-week study plan to learn [topic], with weekly goals and daily 1-hour tasks.",
  },
];
