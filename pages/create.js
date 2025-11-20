import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount, useSigner } from 'wagmi';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import styles from '../styles/CreateMarket.module.css';

export default function CreateMarket() {
  const router = useRouter();
  const { address } = useAccount();
  const { data: signer } = useSigner();
  
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('politics');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [outcomes, setOutcomes] = useState([{ value: '' }, { value: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleOutcomeChange = (index, value) => {
    const newOutcomes = [...outcomes];
    newOutcomes[index].value = value;
    setOutcomes(newOutcomes);
  };

  const addOutcome = () => {
    setOutcomes([...outcomes, { value: '' }]);
  };

  const removeOutcome = (index) => {
    if (outcomes.length <= 2) return;
    const newOutcomes = outcomes.filter((_, i) => i !== index);
    setOutcomes(newOutcomes);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (outcomes.some(outcome => !outcome.value.trim())) {
      setError('Please fill in all outcome fields');
      return;
    }

    if (!endDate || !endTime) {
      setError('Please select an end date and time');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      
      // Combine date and time and convert to timestamp
      const endDateTime = new Date(`${endDate}T${endTime}`).getTime() / 1000; // Convert to seconds
      const now = Math.floor(Date.now() / 1000);
      
      if (endDateTime <= now) {
        throw new Error('End time must be in the future');
      }

      // Connect to the contract
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Call the createMarket function
      const tx = await contract.createMarket(
        question,
        outcomes.map(o => o.value),
        endDateTime,
        { gasLimit: 1000000 }
      );
      
      // Wait for the transaction to be mined
      await tx.wait();
      
      // Redirect to the markets page after successful creation
      router.push('/');
      
    } catch (err) {
      console.error('Error creating market:', err);
      setError(err.message || 'Failed to create market');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create a New Market</h1>
        
        {error && <div className={styles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Will ETH be above $2000 by the end of 2023?"
              className={styles.input}
            />
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Category</label>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              className={styles.select}
            >
              <option value="politics">Politics</option>
              <option value="crypto">Crypto</option>
              <option value="sports">Sports</option>
              <option value="entertainment">Entertainment</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>End Date & Time</label>
            <div className={styles.datetimeInputs}>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={styles.dateInput}
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={styles.timeInput}
              />
            </div>
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Outcomes (at least 2 required)</label>
            {outcomes.map((outcome, index) => (
              <div key={index} className={styles.outcomeRow}>
                <input
                  type="text"
                  value={outcome.value}
                  onChange={(e) => handleOutcomeChange(index, e.target.value)}
                  placeholder={`Outcome ${index + 1}`}
                  className={styles.input}
                />
                {outcomes.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOutcome(index)}
                    className={styles.removeButton}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOutcome}
              className={styles.addButton}
            >
              + Add Outcome
            </button>
          </div>
          
          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => router.back()}
              className={styles.cancelButton}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Market'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
