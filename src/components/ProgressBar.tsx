type ProgressBarProps = {
  current: number
  total: number
  label?: string
}

const ProgressBar = ({ current, total, label }: ProgressBarProps) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="mb-6 w-full rounded-lg border border-gray-200 bg-white p-4">
      {label && <div className="mb-2 text-sm text-gray-700">{label}</div>}
      <div className="h-6 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="flex h-full items-center justify-center bg-blue-600 text-sm font-medium text-white transition-all duration-300"
          style={{ width: `${percentage}%` }}
        >
          {percentage > 10 && `${percentage}%`}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Frame {current} / {total}
      </div>
    </div>
  )
}

export default ProgressBar
