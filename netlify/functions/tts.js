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
    const { text, voice = 'zh-CN' } = JSON.parse(event.body);

    // 获取API key
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    // 调用DashScope TTS API
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2speech/synthesis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-SSE': 'disable'
      },
      body: JSON.stringify({
        model: 'sambert-zhichu-v1',
        input: {
          text: text
        },
        parameters: {
          voice: voice,
          format: 'mp3',
          sample_rate: 22050,
          volume: 50,
          rate: 1.0,
          pitch: 1.0
        }
      })
    });

    if (!response.ok) {
      throw new Error(`TTS API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.output && data.output.audio) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          audioUrl: data.output.audio
        })
      };
    } else {
      throw new Error('No audio data received from TTS API');
    }

  } catch (error) {
    console.error('TTS Function Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'TTS service temporarily unavailable',
        message: error.message
      })
    };
  }
};
