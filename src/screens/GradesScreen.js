import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontWeights } from '../theme';
import NavHeader from '../components/NavHeader';
import TabBar from '../components/TabBar';
import { canManageGrades } from '../services/session';
import {
  DEFAULT_CATEGORY,
  GRADE_MAX,
  GRADE_MIN,
  UNITS_MAX,
  UNITS_MIN,
  db,
  initDatabase,
} from '../services/db';

/** Strictly parses a grade, rejecting partial numbers and out-of-range values. */
function parseGrade(raw) {
  const text = raw.trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < GRADE_MIN || value > GRADE_MAX) return null;
  return Math.round(value * 100) / 100;
}

/** Strictly parses a whole number of units within the allowed range. */
function parseUnits(raw) {
  const text = raw.trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < UNITS_MIN || value > UNITS_MAX) return null;
  return value;
}

/** Maps a grade to a badge tone, mirroring how the registrar reads a grade. */
function gradeTone(grade) {
  if (grade <= 1.5) return 'green';
  if (grade <= 2.5) return 'blue';
  if (grade <= 3.0) return 'orange';
  return 'red';
}

function unitLabel(units) {
  return `${units} ${units === 1 ? 'unit' : 'units'}`;
}

export default function GradesScreen({ onNavigate, role }) {
  // Students see their official record read-only; instructors manage it.
  const canManage = canManageGrades(role);

  const [grades, setGrades] = useState([]);
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [units, setUnits] = useState('');

  const loadGrades = useCallback(() => {
    const rows = db.getAllSync(
      'SELECT id, name, category, grade, units FROM grades WHERE name LIKE ? ORDER BY id',
      ['%' + search + '%']
    );
    setGrades(rows);
  }, [search]);

  // Create/seed the database before the first read.
  useEffect(() => {
    initDatabase();
  }, []);

  useEffect(() => {
    // getAllSync is a synchronous SQLite read; mirroring its rows into state
    // is the intended synchronisation with the external database store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGrades();
  }, [loadGrades, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const resetForm = () => {
    setName('');
    setGrade('');
    setUnits('');
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditing(null);
    resetForm();
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setName(item.name);
    setGrade(Number(item.grade).toFixed(2));
    setUnits(String(item.units));
    setModalVisible(true);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const parsedGrade = parseGrade(grade);
    const parsedUnits = parseUnits(units);

    if (!trimmedName) {
      Alert.alert('Subject required', 'Enter a name for the subject.');
      return;
    }
    if (parsedGrade === null) {
      Alert.alert(
        'Invalid grade',
        `Enter a grade between ${GRADE_MIN.toFixed(2)} and ${GRADE_MAX.toFixed(2)}.`
      );
      return;
    }
    if (parsedUnits === null) {
      Alert.alert(
        'Invalid units',
        `Enter a whole number of units between ${UNITS_MIN} and ${UNITS_MAX}.`
      );
      return;
    }

    try {
      const duplicate = editing
        ? db.getFirstSync(
            'SELECT id FROM grades WHERE name = ? COLLATE NOCASE AND id != ?',
            [trimmedName, editing.id]
          )
        : db.getFirstSync('SELECT id FROM grades WHERE name = ? COLLATE NOCASE', [trimmedName]);

      if (duplicate) {
        Alert.alert('Already added', `"${trimmedName}" is already in your grades.`);
        return;
      }

      if (editing) {
        db.runSync(
          'UPDATE grades SET name = ?, category = ?, grade = ?, units = ? WHERE id = ?',
          [trimmedName, editing.category, parsedGrade, parsedUnits, editing.id]
        );
      } else {
        db.runSync(
          'INSERT INTO grades (name, category, grade, units) VALUES (?, ?, ?, ?)',
          [trimmedName, DEFAULT_CATEGORY, parsedGrade, parsedUnits]
        );
      }

      closeModal();
      // Clear the filter and refresh so the saved subject is always visible.
      setSearch('');
      reload();
    } catch (error) {
      Alert.alert('Could not save', error?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const confirmDelete = (item) => {
    Alert.alert('Delete subject', `Remove "${item.name}" from your grades?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            db.runSync('DELETE FROM grades WHERE id = ?', [item.id]);
            reload();
          } catch (error) {
            Alert.alert('Could not delete', error?.message ?? 'Something went wrong.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const tone = gradeTone(Number(item.grade));
    return (
      <View style={styles.gradeRow}>
        <View style={styles.gradeInfo}>
          <Text style={styles.gradeCode} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.gradeSub}>
            {item.category} · {unitLabel(item.units)}
          </Text>
        </View>
        <View style={[styles.badge, badgeToneStyles[tone]]}>
          <Text style={[styles.badgeText, badgeToneTextStyles[tone]]}>
            {Number(item.grade).toFixed(2)}
          </Text>
        </View>
        {canManage ? (
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={styles.rowAction}
              onPress={() => openEdit(item)}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityLabel={`Edit ${item.name}`}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rowAction}
              onPress={() => confirmDelete(item)}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityLabel={`Delete ${item.name}`}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <NavHeader title="My Grades" backTitle="Home" onBack={() => {}} />

      <View style={styles.controls}>
        <View style={styles.segmentControl}>
          <View style={styles.segmentActive}>
            <Text style={styles.segmentActiveText}>1st Sem 2025-2026</Text>
          </View>
          <View style={styles.segmentInactive}>
            <Text style={styles.segmentInactiveText}>2nd Sem 2024-2025</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          {canManage ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={openAdd}
              activeOpacity={0.8}
              accessibilityLabel="Add subject">
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FlatList
        style={styles.card}
        contentContainerStyle={styles.cardContent}
        data={grades}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.cardHeaderRow}>
            <Text style={styles.header}>SEMESTER SUMMARY</Text>
            {!canManage ? (
              <View style={styles.readOnlyNote}>
                <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.readOnlyText}>View only</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? `No subjects match "${search}"` : 'No subjects yet.'}
          </Text>
        }
      />

      <TabBar active="Grades" onNavigate={onNavigate} />

      {canManage ? (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeModal}>
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Subject' : 'Add Subject'}</Text>

              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. ITP133: Software Engineering"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                maxLength={60}
                returnKeyType="next"
              />

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Grade ({GRADE_MIN.toFixed(2)}–{GRADE_MAX.toFixed(2)})
                  </Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="1.50"
                    placeholderTextColor={colors.textSecondary}
                    value={grade}
                    onChangeText={setGrade}
                    keyboardType="decimal-pad"
                    maxLength={4}
                  />
                </View>
                <View style={[styles.fieldHalf, styles.fieldHalfLast]}>
                  <Text style={styles.fieldLabel}>Units</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="3"
                    placeholderTextColor={colors.textSecondary}
                    value={units}
                    onChangeText={setUnits}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancel]}
                  onPress={closeModal}
                  activeOpacity={0.8}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalSave]}
                  onPress={handleSave}
                  activeOpacity={0.8}>
                  <Text style={styles.modalSaveText}>{editing ? 'Update' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  controls: {
    paddingHorizontal: 16,
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(120,120,128,0.12)',
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
  },
  segmentActive: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 7,
    paddingVertical: 6,
    alignItems: 'center',
    shadowColor: 'rgba(0,0,0,0.051)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  segmentInactive: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  segmentActiveText: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  segmentInactiveText: {
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(120,120,128,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 36,
  },
  searchInput: {
    flex: 1,
    marginLeft: 6,
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  addButton: {
    marginLeft: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 15,
    color: colors.onPrimary,
  },
  card: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(60,60,67,0.18)',
    shadowColor: 'rgba(0,0,0,0.039)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardContent: {
    paddingVertical: 12,
    paddingBottom: 100,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  header: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 13,
    color: colors.green,
    letterSpacing: 0.5,
  },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readOnlyText: {
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(60,60,67,0.18)',
  },
  gradeInfo: {
    flex: 1,
    marginRight: 8,
  },
  gradeCode: {
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  gradeSub: {
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  badge: {
    width: 61,
    height: 33,
    borderRadius: 16.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeGreen: {
    backgroundColor: colors.greenTint,
    borderColor: colors.greenStroke,
  },
  badgeBlue: {
    backgroundColor: colors.blueTint2,
    borderColor: colors.blueStroke2,
  },
  badgeOrange: {
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    borderColor: colors.orange,
  },
  badgeRed: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderColor: colors.danger,
  },
  badgeText: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 13,
  },
  badgeTextGreen: {
    color: colors.greenBright,
  },
  badgeTextBlue: {
    color: colors.blueAlt,
  },
  badgeTextOrange: {
    color: '#C77700',
  },
  badgeTextRed: {
    color: colors.danger,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  rowAction: {
    marginLeft: 8,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  fieldLabel: {
    fontFamily: fonts.medium,
    fontWeight: fontWeights.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  fieldInput: {
    fontFamily: fonts.regular,
    fontWeight: fontWeights.regular,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: 'rgba(120,120,128,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  fieldRow: {
    flexDirection: 'row',
  },
  fieldHalf: {
    flex: 1,
    marginRight: 12,
  },
  fieldHalfLast: {
    marginRight: 0,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: 'rgba(120,120,128,0.12)',
    marginRight: 8,
  },
  modalCancelText: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalSave: {
    backgroundColor: colors.primary,
  },
  modalSaveText: {
    fontFamily: fonts.semiBold,
    fontWeight: fontWeights.semiBold,
    fontSize: 16,
    color: colors.onPrimary,
  },
});

const badgeToneStyles = {
  green: styles.badgeGreen,
  blue: styles.badgeBlue,
  orange: styles.badgeOrange,
  red: styles.badgeRed,
};

const badgeToneTextStyles = {
  green: styles.badgeTextGreen,
  blue: styles.badgeTextBlue,
  orange: styles.badgeTextOrange,
  red: styles.badgeTextRed,
};
