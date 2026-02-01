import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { vaultService } from '../services/vault';
import { VaultAccount, AccountType } from '../types/vault';
import {
  VaultFormInput,
  VaultSelectButton,
  VaultBigButton,
} from './VaultFormInput';

interface VaultAccountScreenProps {
  onClose: () => void;
  editAccountId?: string;
}

const ACCOUNT_TYPES: { label: string; value: AccountType }[] = [
  { label: '🏦 Bank', value: 'bank' },
  { label: '💳 Credit Card', value: 'credit_card' },
  { label: '🛡️ Insurance', value: 'insurance' },
  { label: '🪪 Government ID', value: 'government_id' },
  { label: '⚡ Utility', value: 'utility' },
  { label: '📱 Subscription', value: 'subscription' },
  { label: '📋 Other', value: 'other' },
];

export function VaultAccountScreen({
  onClose,
  editAccountId,
}: VaultAccountScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<VaultAccount | null>(null);

  // Form state
  const [accountType, setAccountType] = useState<AccountType>('bank');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [customerCarePhone, setCustomerCarePhone] = useState('');
  const [notes, setNotes] = useState('');

  // Load accounts
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getAccounts();
      setAccounts(data);

      // If editing, load that account
      if (editAccountId) {
        const account = data.find(a => a.id === editAccountId);
        if (account) {
          populateForm(account);
          setShowForm(true);
        }
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
    setIsLoading(false);
  };

  const populateForm = (account: VaultAccount) => {
    setEditingAccount(account);
    setAccountType(account.type);
    setName(account.name);
    setInstitution(account.institution || '');
    setAccountNumber(account.accountNumber || '');
    setIfscCode(account.ifscCode || '');
    setBranchName(account.branchName || '');
    setCustomerCarePhone(account.customerCarePhone || '');
    setNotes(account.notes || '');
  };

  const resetForm = () => {
    setEditingAccount(null);
    setAccountType('bank');
    setName('');
    setInstitution('');
    setAccountNumber('');
    setIfscCode('');
    setBranchName('');
    setCustomerCarePhone('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an account name');
      return;
    }

    setIsSaving(true);
    try {
      const accountData = {
        type: accountType,
        name: name.trim(),
        institution: institution.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        ifscCode: ifscCode.trim() || undefined,
        branchName: branchName.trim() || undefined,
        customerCarePhone: customerCarePhone.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (editingAccount) {
        await vaultService.updateAccount(editingAccount.id, accountData);
        Alert.alert('Saved', 'Account updated successfully');
      } else {
        await vaultService.addAccount(accountData);
        Alert.alert('Saved', 'Account added successfully');
      }

      resetForm();
      setShowForm(false);
      loadAccounts();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save account. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDelete = (account: VaultAccount) => {
    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await vaultService.deleteAccount(account.id);
            loadAccounts();
          },
        },
      ]
    );
  };

  const handleEdit = (account: VaultAccount) => {
    populateForm(account);
    setShowForm(true);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header onClose={onClose} title="Accounts" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        onClose={showForm ? () => { resetForm(); setShowForm(false); } : onClose}
        title={showForm ? (editingAccount ? 'Edit Account' : 'Add Account') : 'Accounts'}
        showBack={showForm}
      />

      {!showForm ? (
        // Account List
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultBigButton
            title="Add New Account"
            icon="➕"
            onPress={() => setShowForm(true)}
          />

          {accounts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🏦</Text>
              <Text style={styles.emptyText}>No accounts yet</Text>
              <Text style={styles.emptySubtext}>
                Add your bank accounts, insurance, IDs, and more
              </Text>
            </View>
          ) : (
            accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => handleEdit(account)}
                onDelete={() => handleDelete(account)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        // Account Form
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultSelectButton
            label="Account Type"
            value={accountType}
            options={ACCOUNT_TYPES}
            onSelect={(value) => setAccountType(value as AccountType)}
            icon="📁"
          />

          <VaultFormInput
            label="Account Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g., SBI Savings Account"
            required
            icon="📝"
          />

          <VaultFormInput
            label="Institution"
            value={institution}
            onChangeText={setInstitution}
            placeholder="e.g., State Bank of India"
            icon="🏛️"
          />

          {(accountType === 'bank' || accountType === 'credit_card') && (
            <>
              <VaultFormInput
                label="Account/Card Number"
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Enter account number"
                keyboardType="number-pad"
                icon="🔢"
              />

              {accountType === 'bank' && (
                <VaultFormInput
                  label="IFSC Code"
                  value={ifscCode}
                  onChangeText={setIfscCode}
                  placeholder="e.g., SBIN0001234"
                  autoCapitalize="characters"
                  icon="🏦"
                />
              )}

              <VaultFormInput
                label="Branch Name"
                value={branchName}
                onChangeText={setBranchName}
                placeholder="e.g., MG Road Branch"
                icon="📍"
              />
            </>
          )}

          {accountType === 'government_id' && (
            <VaultFormInput
              label="ID Number"
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="Enter ID number"
              icon="🪪"
            />
          )}

          {accountType === 'insurance' && (
            <VaultFormInput
              label="Policy Number"
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="Enter policy number"
              icon="📋"
            />
          )}

          <VaultFormInput
            label="Customer Care Phone"
            value={customerCarePhone}
            onChangeText={setCustomerCarePhone}
            placeholder="e.g., 1800-123-4567"
            keyboardType="phone-pad"
            icon="📞"
          />

          <VaultFormInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes..."
            multiline
            numberOfLines={3}
            icon="📝"
          />

          <View style={styles.buttonContainer}>
            <VaultBigButton
              title={isSaving ? 'Saving...' : 'Save Account'}
              icon="💾"
              onPress={handleSave}
              disabled={isSaving}
            />

            <VaultBigButton
              title="Cancel"
              onPress={() => { resetForm(); setShowForm(false); }}
              variant="secondary"
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// Header component
interface HeaderProps {
  onClose: () => void;
  title: string;
  showBack?: boolean;
}

function Header({ onClose, title, showBack }: HeaderProps): JSX.Element {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.backButton}>
        <Text style={styles.backButtonText}>{showBack ? '← Back' : '← Vault'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

// Account Card component
interface AccountCardProps {
  account: VaultAccount;
  onEdit: () => void;
  onDelete: () => void;
}

function AccountCard({ account, onEdit, onDelete }: AccountCardProps): JSX.Element {
  const typeEmoji = {
    bank: '🏦',
    credit_card: '💳',
    insurance: '🛡️',
    government_id: '🪪',
    utility: '⚡',
    subscription: '📱',
    other: '📋',
  }[account.type] || '📋';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{typeEmoji}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{account.name}</Text>
          {account.institution && (
            <Text style={styles.cardInstitution}>{account.institution}</Text>
          )}
        </View>
      </View>

      {account.accountNumber && (
        <Text style={styles.cardNumber}>
          Account: ****{account.accountNumber.slice(-4)}
        </Text>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardEditButton} onPress={onEdit}>
          <Text style={styles.cardEditText}>✏️ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardDeleteButton} onPress={onDelete}>
          <Text style={styles.cardDeleteText}>🗑️ Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 18,
    color: '#2196F3',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 80,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  cardInstitution: {
    fontSize: 16,
    color: '#666',
    marginTop: 2,
  },
  cardNumber: {
    fontSize: 16,
    color: '#2196F3',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    marginTop: 8,
  },
  cardEditButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  cardEditText: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '600',
  },
  cardDeleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardDeleteText: {
    fontSize: 16,
    color: '#F44336',
    fontWeight: '600',
  },

  buttonContainer: {
    marginTop: 20,
  },
});

export default VaultAccountScreen;
