# Đề cương dự án

## Tên đề tài

**VN Portfolio Risk Auditor — Nền tảng nguyên mẫu giám sát rủi ro, kiểm định
mô hình và kiểm tra sức chịu đựng cho danh mục cổ phiếu Việt Nam**

(Tên làm việc tiếng Anh: *VN Portfolio Risk Auditor: A Prototype Risk
Monitoring, Model-Validation, and Stress-Testing Platform for Vietnam's
Equity Market*)

---

## Lí do lựa chọn đề tài

Rủi ro giảm giá (downside risk) là mối quan tâm trung tâm của bất kỳ ai nắm
giữ tài sản tài chính, nhưng phần lớn công cụ đo rủi ro phổ biến — kể cả
những công cụ được dùng trong giáo dục hoặc trình bày trên báo chí tài chính
— chỉ dừng lại ở bước **tính toán** một con số (ví dụ Value at Risk) mà không
bao giờ **kiểm định** xem con số đó có đáng tin hay không. Một mô hình rủi ro
có thể tạo ra một con số VaR trông rất hợp lý, nhưng nếu tổn thất thực tế
vượt ngưỡng đó thường xuyên hơn nhiều so với những gì mô hình hứa hẹn, thì
con số đó chỉ là một ảo tưởng về sự chắc chắn.

Khoảng trống này — giữa việc *tính* rủi ro và việc *kiểm chứng* rủi ro đã
tính có đúng hay không — là động lực trực tiếp để xây dựng dự án. Đây cũng là
một chủ đề phù hợp để một học sinh trung học phổ thông tự học và tự làm chủ
được toàn bộ chuỗi kiến thức: từ thống kê xác suất (phân vị, kiểm định giả
thuyết), đến lập trình xử lý dữ liệu, đến thiết kế một hệ thống phần mềm hoàn
chỉnh có giao diện, có backend, có kiểm thử tự động và có thể triển khai thực
tế.

Việc chọn thị trường Việt Nam làm bối cảnh (dù dữ liệu hiện tại là mô phỏng)
xuất phát từ mong muốn đóng góp một công cụ giáo dục có liên hệ gần gũi với
bối cảnh trong nước — nơi thị trường cổ phiếu còn tương đối trẻ, thanh khoản
mỏng hơn các thị trường phát triển, và văn hóa "kiểm định mô hình rủi ro" gần
như chưa phổ biến ở cấp độ nhà đầu tư cá nhân.

---

## Mục tiêu dự án

1. Xây dựng một nguyên mẫu (prototype) web đo lường rủi ro giảm giá của một
   danh mục cổ phiếu: mức độ rủi ro, nguồn gốc rủi ro, phản ứng trước kịch
   bản bất lợi, và độ tin cậy của chính mô hình đo rủi ro.
2. Hiện thực và so sánh ba phương pháp ước lượng Value at Risk phổ biến
   (Historical Simulation, Parametric Normal, EWMA Normal) trên cùng một tập
   dữ liệu.
3. Hiện thực một quy trình **kiểm định mô hình** nghiêm ngặt bằng backtest
   kiểu walk-forward kết hợp kiểm định thống kê Kupiec, đảm bảo không có rò rỉ
   dữ liệu tương lai (temporal leakage) trong bất kỳ dự báo nào.
4. Xây dựng một tập dữ liệu mô phỏng có kiểm soát, cho phép việc so sánh giữa
   các mô hình trở nên quan sát được rõ ràng (thông qua các giai đoạn biến
   động được thiết kế có chủ đích).
5. Trình bày toàn bộ kết quả — số liệu, biểu đồ, bảng kiểm định — trong một
   giao diện trực quan, có thể xuất báo cáo, và có thể tái lập 100% từ mã
   nguồn.
6. Trả lời năm câu hỏi nghiên cứu cốt lõi: danh mục có thể mất bao nhiêu; tài
   sản nào chi phối rủi ro; các mô hình VaR khác nhau ở mức độ nào; mô hình
   nào được kiểm định tốt hơn trong giai đoạn biến động cao; và Expected
   Shortfall nói lên điều gì mà VaR không nói lên được.

---

## Cơ sở khoa học

Dự án dựa trên các nền tảng lý thuyết tài chính định lượng đã được thiết lập:

- **Lý thuyết danh mục hiện đại** (Markowitz, 1952) — cho lợi suất, phương
  sai, hiệp phương sai và đa dạng hóa danh mục.
- **Value at Risk (VaR)** như một phân vị tổn thất, và **Expected Shortfall
  (ES)** như trung bình có điều kiện của phần đuôi tổn thất — một thước đo
  rủi ro có tính chất "coherent" (thỏa mãn tính cộng dưới) mà VaR không có
  (Rockafellar & Uryasev).
- **Kiểm định độ phủ không điều kiện (unconditional coverage test)** của
  Kupiec (1995) — kiểm định thống kê xem tần suất vi phạm ngưỡng VaR thực tế
  có phù hợp với tần suất mà mô hình đã hứa hẹn hay không, dựa trên thống kê
  tỷ số hợp lý (likelihood-ratio statistic) tiệm cận phân phối χ²(1).
- **Backtest kiểu walk-forward** — phương pháp luận chuẩn trong ngành để kiểm
  định mô hình rủi ro mà không để mô hình "nhìn thấy trước" dữ liệu tương
  lai, tương đồng với yêu cầu backtest rủi ro thị trường của Ủy ban Basel
  (MAR32).
- **RiskMetrics / EWMA** (J.P. Morgan) — ước lượng phương sai trọng số mũ với
  hệ số suy giảm chuẩn λ = 0,94, cho phép mô hình thích ứng nhanh với biến
  động thị trường thay đổi.
- **Kiểm tra sức chịu đựng (stress testing)** dựa trên kịch bản, kết hợp cả
  kịch bản lịch sử tái diễn và cú sốc tùy chỉnh, như một công cụ bổ sung cho
  VaR/ES ở các tình huống vượt ngoài phân phối thống kê thông thường.

Toàn bộ công thức được tài liệu hóa chi tiết, có thể tái tạo lại bằng tay,
trong [phần Phương pháp luận](TAI-LIEU-KY-THUAT-VI.md#2-phương-pháp-luận).

---

## Ý nghĩa thực tiễn

- **Về mặt giáo dục**: minh họa trực quan sự khác biệt giữa "tính toán" và
  "kiểm định" một mô hình rủi ro — một khái niệm quan trọng trong quản trị
  rủi ro tài chính nhưng hiếm khi được trình bày dễ tiếp cận cho người mới
  học.
- **Về mặt phương pháp**: cung cấp một bộ khung (framework) mã nguồn mở, có
  thể tái sử dụng, để bất kỳ ai muốn thử nghiệm và so sánh các mô hình VaR
  khác nhau trên dữ liệu của riêng họ (thông qua tính năng tải lên CSV).
- **Về định hướng tương lai**: nếu dữ liệu thị trường Việt Nam thực tế được
  đưa vào (có nguồn gốc, giấy phép rõ ràng), công cụ có thể trở thành một
  nền tảng tham khảo cho nhà đầu tư cá nhân hoặc sinh viên tài chính tại Việt
  Nam muốn hiểu rõ hơn về rủi ro danh mục của mình, thay vì chỉ nhìn vào lợi
  nhuận kỳ vọng.
- **Về việc xây dựng năng lực cá nhân**: là một minh chứng cụ thể, có thể
  kiểm chứng được (thông qua mã nguồn, bộ test, tài liệu) cho năng lực tự học
  và tự thực hiện một dự án phần mềm hoàn chỉnh từ đầu đến cuối — phù hợp làm
  hồ sơ năng lực trong ứng tuyển đại học.

---

## Điểm mới của dự án

So với các dashboard rủi ro tài chính thông thường (vốn thường chỉ dừng ở
bước hiển thị một con số VaR), dự án có các điểm khác biệt:

1. **Phân tách rõ ràng "tính toán" và "kiểm định".** Mọi mô hình VaR đều
   được backtest walk-forward và kiểm định bằng thống kê Kupiec trước khi
   được xem là đáng tin; kết quả không bao giờ được diễn giải là "mô hình
   đúng", chỉ là "không mâu thuẫn thống kê với tần suất mục tiêu".
2. **Đảm bảo không rò rỉ dữ liệu tương lai được kiểm thử theo kiểu đối
   kháng.** Thay vì chỉ tin vào logic của vòng lặp, dự án có các test chủ
   động "phá hoại": thay một quan sát tương lai bằng một cú sốc −50% và xác
   nhận toàn bộ các dự báo trước đó giữ nguyên tuyệt đối từng bit.
3. **Kiến trúc "demo tính sẵn" (precomputed demo) nhưng có thể kiểm chứng
   được.** Trang demo hiển thị dữ liệu tĩnh (để không phụ thuộc vào backend
   có thể đang "ngủ" trên gói hosting miễn phí), nhưng người dùng có thể bấm
   nút "Run analysis" để engine Python tính lại trực tiếp và đối chiếu — hai
   kết quả khớp nhau đến từng chữ số vì cùng dùng một đoạn mã.
4. **SciPy chỉ được dùng làm "trọng tài" độc lập trong test, không dùng lúc
   chạy thực.** Các hàm thống kê (phân vị Chuẩn, hàm sống sót χ²) được tự
   hiện thực bằng thư viện chuẩn Python và đối chiếu chéo với SciPy đến sai
   số máy tính — một cách tiếp cận mạnh hơn về mặt bằng chứng đúng đắn so với
   việc chỉ gọi SciPy trực tiếp.
5. **Toàn bộ quy ước dấu, làm tròn, xử lý giá trị thiếu đều được ghi thành
   văn bản tường minh** và được test giữ nguyên trong suốt quá trình phát
   triển — một chi tiết nhỏ nhưng theo kinh nghiệm xây dựng dự án, chính là
   nơi hầu hết lỗi số liệu tài chính âm thầm xảy ra.

---

## Phương pháp nghiên cứu

Dự án kết hợp hai phương pháp:

- **Phương pháp mô phỏng (simulation-based).** Vì chưa có quyền truy cập dữ
  liệu thị trường Việt Nam có giấy phép rõ ràng, một tập dữ liệu tổng hợp
  được tạo ra bằng mô hình nhân tố thị trường (market-factor model), trong
  đó mỗi tài sản có hệ số beta riêng với một chỉ số thị trường mô phỏng, cộng
  thêm nhiễu đặc thù (idiosyncratic noise) và hai giai đoạn biến động cao
  được thiết kế có chủ đích. Cách tiếp cận này cho phép biết trước "đáp án
  đúng" về cấu trúc rủi ro của dữ liệu, từ đó đánh giá khách quan mô hình nào
  phát hiện đúng cấu trúc đó.
- **Phương pháp thực nghiệm định lượng (quantitative empirical).** Ba ước
  lượng VaR khác nhau được áp dụng trên cùng dữ liệu, sau đó được kiểm định
  bằng backtest walk-forward và kiểm định giả thuyết thống kê (kiểm định
  Kupiec), theo đúng chuẩn mực được dùng trong ngành quản trị rủi ro tài
  chính thực tế.

Đi kèm là phương pháp **kỹ thuật phần mềm có kiểm chứng**: mỗi khẳng định về
tính đúng đắn (không rò rỉ dữ liệu, đẳng thức Euler, đối chiếu độc lập với
SciPy, khả năng tái lập dữ liệu) đều được gắn với ít nhất một bài kiểm thử tự
động, thay vì chỉ dựa vào việc đọc lại code bằng mắt.

---

## Quy trình thực hiện

Dự án được chia thành 7 giai đoạn (phase), triển khai tuần tự:

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Thiết kế giao diện "Institutional Midnight", dữ liệu mock để dựng khung UI | Hoàn thành |
| 2 | Backend FastAPI, schema dữ liệu, kiểm tra tính hợp lệ, script sinh dữ liệu demo | Hoàn thành |
| 3 | Engine phân tích rủi ro lõi: VaR, ES, tương quan, mức độ tập trung, đóng góp rủi ro | Hoàn thành |
| 4 | Backtest walk-forward và kiểm định Kupiec | Hoàn thành |
| 5 | Kiểm tra sức chịu đựng (kịch bản lịch sử + cú sốc tùy chỉnh) | Hoàn thành |
| 6 | Trang báo cáo và xuất file CSV | Hoàn thành |
| 7 | Báo cáo nghiên cứu, tài liệu, cấu hình triển khai | Tài liệu xong; **chưa triển khai thực tế** |

Quy trình làm việc trong mỗi giai đoạn tuân theo trình tự: xác định hợp đồng
dữ liệu (API contract) trước → hiện thực logic tính toán trong tầng
`services/` độc lập với framework web → viết test đối chiếu độc lập (cross-
check) → tích hợp vào giao diện → rà soát độc lập (bao gồm một vòng review
bằng một agent AI khác đóng vai trò kiểm tra chéo) → sửa lỗi phát hiện được →
ghi lại tài liệu.

Một nguyên tắc xuyên suốt: mọi số liệu hiển thị trên demo phải được tạo ra
bởi cùng một đoạn mã mà API sử dụng — không có số liệu nào được nhập tay hay
"hard-code".

---

## Sản phẩm đầu ra dự kiến

1. **Mã nguồn hoàn chỉnh**, mở, có thể chạy được ngay (frontend Next.js +
   backend FastAPI), kèm 410 bài kiểm thử tự động (338 backend + 72
   frontend).
2. **Một trang web nguyên mẫu** với bốn khu vực chính: Overview (tổng quan
   rủi ro), Model Audit (kiểm định mô hình), Stress Test (kiểm tra sức chịu
   đựng), Report (báo cáo có thể in/xuất CSV).
3. **Bộ tài liệu kỹ thuật đầy đủ**: phương pháp luận, hạn chế, kiến trúc, từ
   điển dữ liệu, hướng dẫn triển khai — cả bản tiếng Anh gốc và bản dịch tiếng
   Việt tổng hợp.
4. **Báo cáo nghiên cứu khoa học** (8–12 trang, theo đề cương đã có sẵn),
   trình bày phương pháp, kết quả và thảo luận theo chuẩn một bài báo khoa
   học.
5. **Video demo** (~2:45 phút) minh họa luồng sử dụng và phát hiện chính.
6. **Poster và ảnh chụp màn hình** phục vụ trình bày.

---

## Phạm vi và đối tượng

**Phạm vi:**

- Danh mục gồm 5 mã cổ phiếu mô phỏng, trọng số cố định (không tái cân bằng),
  không mô hình hóa chi phí giao dịch, thuế hay thanh khoản.
- Rủi ro thị trường (market risk) một ngày (one-day horizon) duy nhất; không
  tính rủi ro đa kỳ hạn, không tối ưu hóa danh mục, không dự đoán giá, không
  khuyến nghị mua/bán.
- Dữ liệu hiện tại hoàn toàn là **dữ liệu mô phỏng**, không phải dữ liệu thị
  trường Việt Nam thực tế.

**Đối tượng phục vụ:**

- Trực tiếp: hội đồng đánh giá hồ sơ ứng tuyển đại học, giáo viên hướng dẫn,
  và những người đánh giá năng lực nghiên cứu/kỹ thuật của tác giả.
- Gián tiếp (về lâu dài, nếu dự án được mở rộng với dữ liệu thực): sinh viên
  ngành tài chính, nhà đầu tư cá nhân muốn tìm hiểu về đo lường và kiểm định
  rủi ro danh mục.

---

## Công nghệ sử dụng

**Frontend** — Next.js 16 (App Router, Turbopack), TypeScript, Tailwind
CSS v4, Recharts (biểu đồ), các component tự xây theo phong cách shadcn (không
phụ thuộc thư viện UI ngoài), Vitest + React Testing Library cho kiểm thử.

**Backend** — Python 3.11+, FastAPI, Pydantic v2 (serialize camelCase),
pandas, NumPy, quản lý gói bằng `uv`, kiểm thử bằng pytest.

**Thống kê** — SciPy chỉ dùng trong bộ test làm "trọng tài" đối chiếu độc
lập; lúc chạy thực (runtime) chỉ dùng thư viện chuẩn Python (`math`,
`statistics`).

**Hạ tầng/triển khai** — Vercel (Hobby, miễn phí) cho cả site tĩnh Next.js và
Python serverless function; GitHub Actions cho CI (kiểm thử tự động + kiểm
tra khả năng tái lập dữ liệu); phương án dự phòng Hugging Face Spaces cho
backend nếu cần tách riêng.

Toàn bộ ngăn xếp công nghệ được lựa chọn theo tiêu chí: **miễn phí, dễ chuyển
đổi host, và không cần cơ sở dữ liệu hay xác thực** (vì ứng dụng không lưu
trữ dữ liệu người dùng).

---

## Dữ liệu mô phỏng

Tập dữ liệu demo được sinh ra bằng script `generate_demo_data.py`, với:

- **5 mã cổ phiếu hư cấu** (ASSET_A đến ASSET_E) cộng một chỉ số benchmark mô
  phỏng.
- **2.088 ngày giao dịch**, trải từ 2018-01-01 đến 2025-12-31.
- Mỗi tài sản được sinh từ một **mô hình nhân tố thị trường**: lợi suất =
  beta riêng × lợi suất thị trường mô phỏng + nhiễu đặc thù (idiosyncratic
  noise), cộng thêm **hai giai đoạn biến động cao được cố ý nhúng vào** để
  bảng kiểm định mô hình có gì đó thực sự để phân biệt giữa ước lượng thích
  ứng (EWMA) và ước lượng tĩnh.
- **seed cố định = 42**, và một file `manifest.json` ghi lại mã băm SHA-256
  của từng file dữ liệu — đảm bảo việc tạo lại dữ liệu cho ra kết quả giống
  hệt từng byte, được xác minh tự động trong CI chứ không chỉ giả định.

Vì đây là dữ liệu mô phỏng, mọi kết luận rút ra từ nó (ví dụ "EWMA được kiểm
định tốt hơn") chỉ chứng minh cho **phương pháp**, không mang ý nghĩa gì về
thị trường Việt Nam thực tế. Điều này được nêu rõ trên mọi trang của giao
diện và trong tài liệu.

---

## Kết quả đạt được

Trên tập dữ liệu mô phỏng, engine đã tính toán và kiểm định được:

**Thống kê mô tả** — độ biến động quy đổi theo năm: 24,63%; mức sụt giảm tối
đa: −54,68%; VaR một ngày ở mức 95% (Historical Simulation): 2,35%; Expected
Shortfall 95%: 3,63% (cao hơn VaR khoảng 55%); chỉ số tập trung HHI: 0,2100;
tài sản đóng góp rủi ro lớn nhất là ASSET_B (29,7% độ biến động danh mục,
trên trọng số 25%).

**Kết quả backtest walk-forward** (cửa sổ 250 ngày, 1.837 ngày kiểm định):

| Mô hình | Mức tin cậy | Số vi phạm | Kỳ vọng | Giá trị p (Kupiec) | Kết quả |
|---|---:|---:|---:|---:|---|
| Historical Simulation | 95% | 116 | 91,9 | 0,0128 | Không đạt |
| Historical Simulation | 99% | 34 | 18,4 | 0,0010 | Không đạt |
| Parametric Normal | 95% | 109 | 91,9 | 0,0741 | Đạt |
| Parametric Normal | 99% | 39 | 18,4 | <0,0001 | Không đạt |
| EWMA Normal | 95% | 105 | 91,9 | 0,1683 | Đạt |
| EWMA Normal | 99% | 23 | 18,4 | 0,2961 | Đạt |

Hai phát hiện chính: **EWMA là mô hình duy nhất không bị bác bỏ ở cả hai mức
độ tin cậy** (vì nó thích ứng nhanh với các giai đoạn biến động được nhúng
sẵn trong dữ liệu), và **Parametric Normal đạt kiểm định ở 95% nhưng thất
bại dứt khoát ở 99%** — minh chứng rõ ràng cho hiện tượng "đuôi mỏng" của
giả định phân phối Chuẩn.

**Kiểm tra sức chịu đựng** — ba kịch bản lịch sử được engine tự tìm ra trong
dữ liệu: tuần tệ nhất (−22,99%), tháng tệ nhất (−15,23%), quý tệ nhất
(−24,28%) — cho thấy khoảng cách lớn giữa VaR một ngày (2,35%) và tổn thất
thực sự có thể xảy ra trong một đợt căng thẳng kéo dài.

**Về mặt kỹ thuật phần mềm** — 410 bài kiểm thử tự động (338 backend, 72
frontend) đều pass; một vòng rà soát độc lập (bằng một agent AI đóng vai trò
kiểm tra chéo) đã phát hiện và toàn bộ đã được khắc phục 4 lỗi thực sự,
nghiêm trọng nhất là một lỗi khiến hệ thống có thể báo cáo "trong giới hạn
rủi ro" (within limit) trong khi thực ra kiểm tra giới hạn VaR 95% chưa từng
được thực hiện.

---

## Demo và triển khai

**Demo hiện tại**: chạy được đầy đủ ở môi trường local (`npm run dev` cho
frontend, `uvicorn` cho backend), với trang demo tải dữ liệu tính sẵn (không
cần chờ backend) và nút "Run analysis" cho phép người dùng yêu cầu engine
Python tính lại trực tiếp để đối chiếu.

**Trạng thái triển khai thực tế**: **chưa được deploy công khai**. Cấu hình
để triển khai lên Vercel (site Next.js tĩnh + Python serverless function) đã
được viết sẵn (`vercel.json`, `api/index.py`, `requirements.txt`) và tài liệu
hóa chi tiết từng bước cùng phương án dự phòng (tách backend sang Hugging
Face Spaces nếu cần), nhưng chưa được xác minh trên môi trường thực. Đây là
rủi ro/thiếu sót lớn nhất còn tồn đọng của dự án ở thời điểm hiện tại.

Kiến trúc được thiết kế sao cho rủi ro triển khai được giảm thiểu tối đa:
phần quan trọng nhất (trang demo) là hoàn toàn tĩnh và không phụ thuộc vào
backend còn sống hay không; chỉ tính năng tải file CSV của người dùng mới cần
đến API đang chạy.

---

## Hướng phát triển

1. **Đưa dữ liệu thị trường Việt Nam thực tế vào** (có nguồn gốc, giấy phép
   và ngày lấy dữ liệu được ghi rõ trong từ điển dữ liệu), thay thế hoàn toàn
   dữ liệu mô phỏng hiện tại.
2. **Kiểm định độ phủ có điều kiện (conditional coverage)** theo Christoffersen
   (1998) — bổ sung khả năng phát hiện hiện tượng "dồn cụm" vi phạm mà kiểm
   định Kupiec hiện tại bỏ sót.
3. **Mô phỏng Monte Carlo với phân phối Student-t** — thêm một ước lượng VaR
   thứ tư, xử lý tốt hơn hiện tượng đuôi béo so với Parametric Normal.
4. **So sánh mô hình theo từng chế độ biến động (regime comparison)** một
   cách trực tiếp, thay vì chỉ nêu như một giả thuyết chưa kiểm định.
5. **Kiểm tra sức chịu đựng có điều chỉnh thanh khoản**, với ràng buộc ở cấp
   độ vị thế thay vì phép tính tuyến tính đơn giản hiện tại.
6. **Rủi ro đa kỳ hạn** (multi-day horizon) với phương pháp quy đổi có cơ sở,
   thay vì chỉ dừng ở dự báo một ngày.
7. **Hoàn tất triển khai công khai** lên Vercel/GitHub, chụp ảnh màn hình,
   quay video demo, và hoàn thiện báo cáo nghiên cứu 8–12 trang.
8. Về lâu dài: quản trị mô hình (versioning, phê duyệt, tái kiểm định định
   kỳ), nhật ký kiểm toán, và kiểm định độc lập bởi người không tham gia xây
   dựng — những yêu cầu cần thiết nếu công cụ tiến gần hơn tới một hệ thống
   sử dụng thực tế (dù đây không phải mục tiêu trước mắt của một nguyên mẫu
   giáo dục).

---

## Tài liệu tham khảo

1. Markowitz, H. (1952). "Portfolio Selection." *The Journal of Finance*,
   7(1), 77–91.
2. Kupiec, P. H. (1995). "Techniques for Verifying the Accuracy of Risk
   Measurement Models." *Journal of Derivatives*.
3. Rockafellar, R. T., & Uryasev, S. "Optimization of Conditional
   Value-at-Risk." *Journal of Risk*.
4. Christoffersen, P. (1998). "Evaluating Interval Forecasts."
   *International Economic Review*.
5. Basel Committee on Banking Supervision. Market-risk backtesting
   requirements (MAR32).
6. J.P. Morgan/Reuters. *RiskMetrics Technical Document* (nguồn cho hệ số
   suy giảm EWMA λ = 0,94).

Xem thêm tài liệu kỹ thuật đầy đủ (bản dịch tiếng Việt) tại
[TAI-LIEU-KY-THUAT-VI.md](TAI-LIEU-KY-THUAT-VI.md), bao gồm chi tiết kiến
trúc, phương pháp luận, hạn chế, hướng dẫn triển khai, kịch bản demo và đề
cương báo cáo nghiên cứu đầy đủ.
