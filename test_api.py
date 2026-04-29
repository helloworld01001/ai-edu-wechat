from openai import OpenAI

client = OpenAI(
    api_key="sk-user-xplC7mrW2TzZvGJnVXKAqCCIQyTwhSHWQFxAjtb-onQgUKKpBIkqnbC7vKMsOzyb",
    base_url="https://api.flagos.net/v1"
)

response = client.chat.completions.create(
    # model="MiniMax-M2.5-Inner",
    model="glm-5",
    messages=[
        {"role": "user", "content": "你好，请介绍一下你自己"}
    ]
)

print(response.choices[0].message.content)