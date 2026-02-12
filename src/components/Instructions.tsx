const Instructions = () => {
  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-gray-800">วิธีใช้งาน</h2>
      <ol className="list-inside list-decimal space-y-2 text-sm text-gray-600">
        <li>
          เข้าเกม 7k ไปที่หน้า
          <img src="/game.png" alt="Game screen" className="w-120" />
        </li>
        <li>
          กดปุ่ม <strong>Screen Record</strong> ด้านล่าง เลือกหน้าเกม 7k
        </li>
        <li>
          กดปุ่ม <strong>Start</strong> ในเกมเพื่อเริ่มพลิกไพ่
        </li>
        <li>
          เมื่อพลิกไพ่ครบทุกใบแล้ว กลับมาที่แอปฯ แล้วกดปุ่ม <strong>Stop Recording</strong>
        </li>
        <li>รอให้แอปฯ ประมวลผลภาพและสร้างเฉลย</li>
      </ol>
    </div>
  )
}

export default Instructions
