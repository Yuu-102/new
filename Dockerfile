# 使用官方 Python 3.10 輕量版
FROM python:3.10-slim

# 設定工作目錄
WORKDIR /app

# 先複製 requirements.txt 並安裝套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製所有專案檔案
COPY . .

# 開放 Flask 預設的 port
EXPOSE 5000

# 啟動指令
CMD ["python", "app.py"]
