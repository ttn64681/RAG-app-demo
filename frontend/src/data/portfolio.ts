import type { Document } from '@/lib/vector-store';

/**
 * Your portfolio data - customize this with your actual information
 * This will be embedded and stored in Redis for RAG retrieval
 */
export const portfolioDocuments: Document[] = [
  {
    id: 'about-1',
    content: 'I am a passionate full-stack developer with expertise in modern web technologies. I love building innovative applications that solve real-world problems.',
    metadata: { category: 'about', type: 'introduction' },
  },
  {
    id: 'skills-1',
    content: 'Technical Skills: React, Next.js, TypeScript, Node.js, Python, Redis, PostgreSQL, AI/ML integration, REST APIs, Docker, AWS, Git.',
    metadata: { category: 'skills', type: 'technical' },
  },
  {
    id: 'skills-2',
    content: 'Soft Skills: Problem-solving, teamwork, communication, project management, agile methodologies, code review, mentoring.',
    metadata: { category: 'skills', type: 'soft' },
  },
  {
    id: 'project-1',
    content: 'RAG Portfolio Chatbot: Built a Retrieval-Augmented Generation chatbot using Next.js, Redis vector storage, Google Gemini embeddings, and Gemini 2.5 flash LLM. Features pixel-art UI with dynamic message bubbles.',
    metadata: { category: 'projects', type: 'web-app', tech: ['Next.js', 'Redis', 'AI/ML'] },
  },
  {
    id: 'project-2',
    content: 'Cinema E-booking Platform: Developed a full-stack cinema e-booking platform with React, Node.js, Springboot, and PostgreSQL. Implemented (mock) payment processing, inventory management, and admin dashboard.',
    metadata: { category: 'projects', type: 'web-app', tech: ['React', 'Node.js', 'PostgreSQL'] },
  },
  {
    id: 'experience-1',
    content: 'Worked as full-stack team member for rock band\'s website for 6 months.',
    metadata: { category: 'experience', type: 'work', years: '2022-present' },
  },
  {
    id: 'education-1',
    content: 'Bachelor of Science in Computer Science from University of Georgia (2023-2026). Relevant coursework: Data Structures, Algorithms, Database Systems, Software Engineering.',
    metadata: { category: 'education', type: 'degree' },
  },
  {
    id: 'interests-1',
    content: 'I am passionate about AI/ML, open-source contributions, frontend/full-stack development, UI-design, and Game Dev. In my free time, I contribute to open-source projects and design websites and games, as well as practice new instruments.',
    metadata: { category: 'interests', type: 'personal' },
  },
];
