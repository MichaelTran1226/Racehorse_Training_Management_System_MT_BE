# Hướng dẫn thiết lập Stitch MCP cho thành viên nhóm

Tài liệu này hướng dẫn cách kết nối Stitch MCP vào môi trường phát triển (Antigravity IDE, Cursor, Claude Code, Gemini CLI) để gọi tool và tra cứu / nhập code màn hình từ Google Stitch.

---

## 1. Lấy API Key từ Trưởng nhóm
API Key truy cập Stitch được cấp qua kênh nội bộ bảo mật của nhóm (Zalo / Discord kín).
* **Tuyệt đối không commit API Key lên GitHub**.

---

## 2. Thiết lập cấu hình MCP trên máy của bạn

### Cách 1: Cấu hình Workspace (Dự án hiện tại)
1. Trong thư mục `.agents/`, copy file `mcp_config.json.example` thành file `.agents/mcp_config.json`:
   ```bash
   cp .agents/mcp_config.json.example .agents/mcp_config.json
   ```
2. Mở file `.agents/mcp_config.json` và thay `YOUR_API_KEY_HERE` bằng API Key được cấp.
3. Khởi động lại IDE / AI Agent.

### Cách 2: Cấu hình Global (Khuyên dùng cho Antigravity IDE)
Thêm cấu hình vào file `~/.gemini/config/mcp_config.json` trên máy của bạn:
```json
{
  "mcpServers": {
    "StitchMCP": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://stitch.googleapis.com/mcp",
        "--header",
        "X-Goog-Api-Key: <DIEN_KEY_VAO_DAY>"
      ]
    }
  }
}
```

---

## 3. Nếu không dùng MCP?
Thành viên Frontend **không bắt buộc phải cài đặt MCP**.
Toàn bộ tài nguyên thiết kế đã có sẵn offline tại:
* [docs/ui-design/DESIGN.md](ui-design/DESIGN.md) — Màu sắc, typography, spacing, quy tắc UI.
* [docs/ui-design/style.css](ui-design/style.css) — Toàn bộ CSS tokens và class mẫu.
* [docs/ui-design/SCREEN-MAP.md](ui-design/SCREEN-MAP.md) — Danh sách 31 màn hình Desktop chuẩn.
* [docs/ui-design/assets/so-do-giai-phau.png](ui-design/assets/so-do-giai-phau.png) — Sơ đồ giải phẫu hệ xương 2D (900x600).
