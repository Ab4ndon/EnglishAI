// fetch is available globally in Node.js 18+

exports.handler = async (event, context) => {
  // 允许跨域请求
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { expectedText, userTranscript, evaluationResult, isWord } = JSON.parse(event.body);

    // 获取API key
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    // 构建AI提示词
    const score = evaluationResult?.score || 0;
    const isCorrect = evaluationResult?.isCorrect || false;

    const prompt = `
      你是一位友好的英语老师，正在指导一个7岁的小学生学习英语朗读。
      学生需要朗读的内容是："${expectedText}"
      学生的实际朗读是："${userTranscript}"
      测评得分：${score}分（满分100分）
      是否通过：${isCorrect ? '通过' : '需要改进'}

      请根据得分和朗读内容给出个性化的评价和建议：

      如果得分很高（90-100分）：表扬具体的优点，如发音清晰、语调自然等
      如果得分中等（60-89分）：指出进步之处，同时给出具体改进建议
      如果得分较低（0-59分）：鼓励为主，指出主要需要改进的地方

      请用中文给出：
      1. 一句个性化的鼓励性评价（15-25字），不要总是说"读得非常完美"
      2. 2-3条具体的提升建议（每条建议10-15字），每条建议内容要各不相同

      格式要求：
      评价：[你的个性化评价]
      建议1：[第一条建议]
      建议2：[第二条建议]
      建议3：[第三条建议，可选]

      重要：建议内容不能重复，重点关注不同的发音方面
    `;

    // 调用DashScope API
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-SSE': 'disable'
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
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
          max_tokens: 200
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    let content = '';

    if (data.output && data.output.choices && data.output.choices.length > 0) {
      content = data.output.choices[0].message?.content || data.output.choices[0].message?.text || '';
    } else if (data.output?.text) {
      content = data.output.text;
    }

    // 解析AI返回的内容
    const suggestions = [];
    let message = `得分：${score}分`;

    if (content) {
      // 提取评价
      const messageMatch = content.match(/评价[：:]\s*(.+?)(?:\n|建议|$)/);
      if (messageMatch) {
        message = messageMatch[1].trim();
      }

      // 提取建议
      const suggestionMatches = content.matchAll(/建议\d+[：:]\s*(.+?)(?:\n|建议|$)/g);
      for (const match of suggestionMatches) {
        suggestions.push(match[1].trim());
      }
    }

    // 如果没有提取到建议，使用默认建议
    if (suggestions.length === 0) {
      if (score < 60) {
        suggestions.push('注意每个音节的发音清晰度');
        suggestions.push('尝试放慢速度，确保每个音都发准确');
        if (!isWord) {
          suggestions.push('注意单词之间的连读和停顿');
        }
      } else if (score < 80) {
        suggestions.push('发音不错，继续练习会让它更完美');
        suggestions.push('注意音调的准确性');
      } else {
        suggestions.push('发音很棒！继续保持！');
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: message || (isCorrect ? `太棒了！得分：${score}分` : `再试试看！得分：${score}分`),
        score,
        suggestions: suggestions.slice(0, 3) // 最多3条建议
      })
    };

  } catch (error) {
    console.error('AI Feedback Function Error:', error);

    // 返回默认反馈
    const { evaluationResult, isWord } = JSON.parse(event.body || '{}');
    const score = evaluationResult?.score || 0;
    const isCorrect = evaluationResult?.isCorrect || false;

    const suggestions = [];
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
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: isCorrect ? `太棒了！得分：${score}分` : `再试试看！得分：${score}分`,
        score,
        suggestions
      })
    };
  }
};
