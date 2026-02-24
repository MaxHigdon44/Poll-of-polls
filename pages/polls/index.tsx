import { useEffect, useState } from 'react'

type Poll = {
  source: string
  date: string
  party: string
  percentage: number
}

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([])

  useEffect(() => {
    fetch('/api/polls')
      .then(res => res.json())
      .then(data => setPolls(data))
  }, [])

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Poll-of-Polls</h1>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>Source</th>
            <th>Date</th>
            <th>Party</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          {polls.map((poll, index) => (
            <tr key={index}>
              <td>{poll.source}</td>
              <td>{poll.date}</td>
              <td>{poll.party}</td>
              <td>{poll.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
