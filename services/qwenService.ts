import { USER_NAME } from '../constants';

// 计算文本相似度的辅助函数
function calculateTextSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // 计算Levenshtein距离
  const matrix: number[][] = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}

// Netlify Functions API路径
const NETLIFY_FUNCTIONS_BASE = import.meta.env.DEV
  ? '/.netlify/functions'  // 开发环境
  : 'https://myenglishai.netlify.app/.netlify/functions'; // 生产环境

// API Key 配置
const apiKey = import.meta.env.VITE_DASHSCOPE_API_KEY;

export const generateTeacherFeedback = async (
  context: string,
  studentInput: string,
  isCorrect: boolean
): Promise<string> => {
  if (!apiKey) {
    // 如果没有 API Key，使用备用响应
    if (isCorrect) return `Great job, ${USER_NAME}! You said that perfectly!`;
    return `Nice try, ${USER_NAME}. Let's try that one more time together!`;
  }

  try {
    const modelId = 'qwen-turbo'; // 使用 qwen-turbo 模型，快速响应
    const prompt = `
      You are Bella, a friendly, energetic, and encouraging English teacher for a 7-year-old boy named ${USER_NAME}.
      The student just attempted to say: "${context}".
      The student's performance was: ${isCorrect ? 'Correct/Good' : 'Needs Improvement'}.
      
      Give a very short (max 15 words) spoken response.
      If correct: Be enthusiastic and praise specifically.
      If incorrect: Be encouraging and gentle, suggesting to try again.
      Style: Fun, simple English, maybe 1-2 words of Chinese for support if needed.
    `;

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-SSE': 'disable'
      },
      body: JSON.stringify({
        model: modelId,
        input: {
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        parameters: {
          temperature: 0.7,
          max_tokens: 50
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    // 解析 DashScope API 响应
    if (data.output && data.output.choices && data.output.choices.length > 0) {
      const content = data.output.choices[0].message?.content || data.output.choices[0].message?.text;
      return content || "Good job!";
    }
    
    // 兼容其他可能的响应格式
    if (data.output?.text) {
      return data.output.text;
    }
    
    return "Good job!";
  } catch (error) {
    console.error("Qwen API Error:", error);
    return isCorrect ? "Super!" : "Let's try again!";
  }
};

// 生成详细的朗读评价和建议（包含评分）
export const generateDetailedFeedback = async (
  expectedText: string,
  userTranscript: string,
  evaluationResult: any,
  isWord: boolean
): Promise<{
  message: string;
  score: number;
  suggestions: string[];
}> => {
  // 如果 evaluationResult 不存在，基于文本相似度计算评分
  let score = evaluationResult?.score;
  let isCorrect = evaluationResult?.isCorrect;
  
  if (score === undefined || score === null) {
    // 如果没有评分，计算文本相似度作为评分
    const cleanUser = userTranscript.toLowerCase().trim();
    const cleanExpected = expectedText.toLowerCase().trim();
    
    if (!cleanUser || cleanUser.length === 0) {
      // 如果没有识别到任何文本，给一个较低的分数
      score = 0;
      isCorrect = false;
    } else {
      // 简单的相似度计算
      const similarity = calculateTextSimilarity(cleanUser, cleanExpected);
      score = Math.round(similarity * 100);
      isCorrect = similarity >= (isWord ? 0.65 : 0.6);
    }
  }
  
  // 确保 score 在 0-100 范围内
  score = Math.max(0, Math.min(100, score));
  
  if (!apiKey) {
    // 如果没有 API Key，使用备用响应
    const suggestions: string[] = [];
    if (score < 60) {
      suggestions.push('注意每个音节的发音清晰度');
      suggestions.push('尝试放慢速度，确保每个音都发准确');
    } else if (score < 80) {
      suggestions.push('发音不错，继续练习会让它更完美');
      suggestions.push('注意音调的准确性');
    } else {
      suggestions.push('发音很棒！继续保持！');
    }
    
    return {
      message: isCorrect 
        ? `太棒了！你读得很好！得分：${score}分` 
        : `再试试看！当前得分：${score}分，继续加油！`,
      score,
      suggestions
    };
  }

  try {
    // 调用 Netlify Functions 的 ai-feedback endpoint
    const response = await fetch(`${NETLIFY_FUNCTIONS_BASE}/ai-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expectedText,
        userTranscript,
        evaluationResult: { score, isCorrect },
        isWord
      })
    });

    if (!response.ok) {
      throw new Error(`AI feedback request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Netlify Functions 返回的数据格式
    return {
      message: data.message || (isCorrect ? `太棒了！得分：${score}分` : `再试试看！得分：${score}分`),
      score: data.score || score,
      suggestions: data.suggestions || []
    };
  } catch (error) {
    console.error("Qwen API Error:", error);
    
    // 错误时返回默认建议
    const suggestions: string[] = [];
    if (score < 60) {
      suggestions.push('注意每个音节的发音清晰度');
      suggestions.push('尝试放慢速度，确保每个音都发准确');
    } else if (score < 80) {
      suggestions.push('发音不错，继续练习会让它更完美');
      suggestions.push('注意音调的准确性');
    } else {
      suggestions.push('发音很棒！继续保持！');
    }
    
    return {
      message: isCorrect ? `太棒了！得分：${score}分` : `再试试看！得分：${score}分`,
      score,
      suggestions
    };
  }
};

